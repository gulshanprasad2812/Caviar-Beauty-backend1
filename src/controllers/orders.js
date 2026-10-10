import { prisma } from '../db.js';
import { generateOrderNumber } from '../utils/helpers.js';
import { AppError } from '../middleware/errorHandler.js';
import { sendOrderConfirmationEmail, sendOrderShippedEmail, sendOrderDeliveredEmail } from '../services/email.js';
import { reserveStock, releaseStock, availableStock } from '../services/inventory.js';
import { Prisma } from '@prisma/client';

const D = Prisma.Decimal;

export const createOrder = async (req, res, next) => {
  try {
    const { shippingAddressId, billingAddressId, paymentMethod, couponCode, notes, idempotencyKey } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user?.isVerified) throw new AppError(403, 'Please verify your email before placing an order');

    if (idempotencyKey) {
      const existing = await prisma.order.findUnique({ where: { idempotencyKey } });
      if (existing) {
        if (existing.userId !== req.user.id) throw new AppError(403, 'Invalid idempotency key');
        return res.status(200).json({ ...existing, duplicate: true });
      }
    }

    const cartItems = await prisma.cartItem.findMany({
      where: { userId: req.user.id },
      include: { product: { include: { images: { where: { isPrimary: true }, take: 1 }, inventory: true } } },
    });
    if (!cartItems.length) throw new AppError(400, 'Cart is empty');

    if (shippingAddressId) {
      const address = await prisma.address.findFirst({ where: { id: shippingAddressId, userId: req.user.id } });
      if (!address) throw new AppError(404, 'Shipping address not found');
    }
    if (billingAddressId) {
      const address = await prisma.address.findFirst({ where: { id: billingAddressId, userId: req.user.id } });
      if (!address) throw new AppError(404, 'Billing address not found');
    }

    const variantIds = cartItems.map((i) => i.variantId).filter(Boolean);
    const variants = variantIds.length
      ? await prisma.productVariant.findMany({ where: { id: { in: variantIds } } })
      : [];
    const variantMap = new Map(variants.map((v) => [v.id, v]));

    let subtotal = new D(0);
    const orderItems = cartItems.map((item) => {
      const variant = item.variantId ? variantMap.get(item.variantId) : null;
      const price = variant?.price ?? item.product.discountPrice ?? item.product.basePrice;
      const quantity = item.quantity;

      if (quantity < 1) throw new AppError(400, `Invalid quantity for ${item.product.name}`);
      if (item.variantId && (!variant || variant.productId !== item.productId || !variant.isActive)) {
        throw new AppError(400, `Invalid product variant for ${item.product.name}`);
      }
      if (variant && variant.stock < quantity) {
        throw new AppError(400, `Insufficient stock for ${item.product.name}${variant.color ? ` (${variant.color})` : ''}${variant.size ? ` (${variant.size})` : ''}`);
      }
      const inventory = item.product.inventory;
      if (inventory && availableStock(inventory) < quantity) {
        throw new AppError(400, `Insufficient stock for ${item.product.name}`);
      }

      subtotal = subtotal.plus(price.times(quantity));
      return {
        productId: item.productId,
        variantId: item.variantId,
        name: item.product.name,
        price,
        quantity,
        image: item.product.images[0]?.url || '',
        size: variant?.size || '',
        color: variant?.color || '',
      };
    });

    let discount = new D(0);
    let coupon = null;
    if (couponCode) {
      coupon = await prisma.coupon.findUnique({ where: { code: couponCode.toUpperCase() } });
      if (!coupon || !coupon.isActive || (coupon.expiresAt && coupon.expiresAt <= new Date()) || (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit)) {
        throw new AppError(400, 'Invalid, expired, or exhausted coupon');
      }
      {
        if (coupon.minOrder != null && subtotal.lessThan(coupon.minOrder)) {
          throw new AppError(400, `This coupon requires a minimum order of ₹${coupon.minOrder}`);
        }
        discount = coupon.discountType === 'percentage'
          ? subtotal.times(coupon.discountValue).div(100)
          : coupon.discountValue;
        if (coupon.maxDiscount != null && discount.greaterThan(coupon.maxDiscount)) discount = coupon.maxDiscount;
      }
    }
    if (discount.greaterThan(subtotal)) discount = subtotal;

    const tax = subtotal.times(0.18).toDecimalPlaces(2);
    const shippingCost = subtotal.greaterThan(5000) ? new D(0) : new D(99);
    const total = subtotal.plus(tax).plus(shippingCost).minus(discount).toDecimalPlaces(2);

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNumber: generateOrderNumber(),
          userId: req.user.id,
          subtotal, shippingCost, tax, discount, couponCode: coupon?.code, total, paymentMethod, notes,
          shippingAddressId, billingAddressId,
          currency: 'INR',
          ...(idempotencyKey && { idempotencyKey }),
          items: { create: orderItems },
        },
        include: { items: true },
      });

      try {
        await reserveStock(tx, created.id, orderItems);
      } catch (err) {
        throw new AppError(400, err.message.startsWith('INSUFFICIENT_STOCK:') ? err.message.replace('INSUFFICIENT_STOCK:', 'Insufficient stock for ') : 'Could not reserve stock');
      }

      await tx.orderStatusHistory.create({
        data: { orderId: created.id, status: 'PENDING', note: 'Order placed' },
      });

      if (coupon) {
        const conditions = {
          id: coupon.id,
          isActive: true,
          ...(coupon.usageLimit ? { usedCount: { lt: coupon.usageLimit } } : {}),
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        };
        const claimed = await tx.coupon.updateMany({ where: conditions, data: { usedCount: { increment: 1 } } });
        if (claimed.count !== 1) throw new AppError(400, 'Coupon is no longer available');
      }
      await tx.cartItem.deleteMany({ where: { userId: req.user.id } });

      return created;
    });

    const userEmail = user.email;
    const userFirstName = user.firstName;
    sendOrderConfirmationEmail(userEmail, userFirstName, { ...order, items: orderItems }).catch((err) => console.error('[EMAIL] order confirmation failed:', err.message));

    res.status(201).json(order);
  } catch (err) { next(err); }
};

export const getOrders = async (req, res, next) => {
  try {
    const where = { userId: req.user.id };
    if (req.user.role === 'ADMIN' && req.query.userId) where.userId = req.query.userId;

    const orders = await prisma.order.findMany({
      where,
      include: { items: true, payment: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ orders });
  } catch (err) { next(err); }
};

export const getOrder = async (req, res, next) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { items: { include: { product: { include: { images: { where: { isPrimary: true }, take: 1 } } } } }, payment: true, refunds: true, shipment: true, statusHistory: { orderBy: { createdAt: 'desc' } } },
    });
    if (!order) throw new AppError(404, 'Order not found');
    if (order.userId !== req.user.id && req.user.role !== 'ADMIN') throw new AppError(403, 'Access denied');
    res.json(order);
  } catch (err) { next(err); }
};

export const cancelOrder = async (req, res, next) => {
  try {
    const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { items: true } });
    if (!order) throw new AppError(404, 'Order not found');
    if (order.userId !== req.user.id && req.user.role !== 'ADMIN') throw new AppError(403, 'Access denied');
    if (!['PENDING', 'CONFIRMED'].includes(order.status)) throw new AppError(400, 'Order cannot be cancelled');

    await prisma.$transaction(async (tx) => {
      const items = order.items.map((i) => ({ ...i, orderPaid: order.paymentStatus === 'COMPLETED' }));
      await releaseStock(tx, order.id, items);
      await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, status: 'CANCELLED', note: 'Order cancelled by user' },
      });
    });

    res.json({ message: 'Order cancelled and stock restored' });
  } catch (err) { next(err); }
};

export const returnOrder = async (req, res, next) => {
  try {
    const { reason } = req.body || {};
    const order = await prisma.order.findUnique({ where: { id: req.params.id }, include: { items: true } });
    if (!order) throw new AppError(404, 'Order not found');
    if (order.userId !== req.user.id) throw new AppError(403, 'Access denied');
    if (order.status !== 'DELIVERED') throw new AppError(400, 'Only delivered orders can be returned');
    await prisma.$transaction(async (tx) => {
      const items = order.items.map((i) => ({ ...i, orderPaid: true }));
      await releaseStock(tx, order.id, items);
      await tx.order.update({ where: { id: order.id }, data: { status: 'RETURNED', returnReason: reason || null } });
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, status: 'RETURNED', note: `Return requested${reason ? `: ${reason}` : ''}` },
      });
    });
    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    res.json(updated);
  } catch (err) { next(err); }
};

export const getAllOrders = async (req, res, next) => {
  try {
    const { status, search, page = '1', limit = '20' } = req.query;
    const where = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: { items: true, user: { select: { id: true, firstName: true, lastName: true, email: true } }, payment: true, refunds: true, shipment: true, statusHistory: { orderBy: { createdAt: 'desc' } } },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.order.count({ where }),
    ]);

    res.json({ orders, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
  } catch (err) { next(err); }
};

export const updateOrderStatus = async (req, res, next) => {
  try {
    const { status, trackingNumber } = req.body;
    const validStatuses = ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'];
    if (status && !validStatuses.includes(status)) throw new AppError(400, 'Invalid status');

    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) throw new AppError(404, 'Order not found');

    if (status === 'CANCELLED' && order.status !== 'CANCELLED') {
      await prisma.$transaction(async (tx) => {
        const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
        await releaseStock(tx, order.id, items.map((i) => ({ ...i, orderPaid: order.paymentStatus === 'COMPLETED' })));
      });
    }

    if (status && order.status !== status) {
      await prisma.orderStatusHistory.create({
        data: { orderId: order.id, status, note: `Status changed to ${status}` },
      });
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        ...(status && { status }),
        ...(trackingNumber !== undefined && { trackingNumber }),
        ...(status === 'DELIVERED' && { deliveredAt: new Date() }),
        ...(status === 'SHIPPED' && { estimatedDelivery: new Date(Date.now() + 5 * 86400000) }),
      },
      include: { items: true, user: { select: { firstName: true, lastName: true, email: true } } },
    });

    if (status === 'SHIPPED') {
      sendOrderShippedEmail(updated.user.email, updated.user.firstName, updated).catch((err) => console.error('[EMAIL] order shipped failed:', err.message));
    }
    if (status === 'DELIVERED') {
      sendOrderDeliveredEmail(updated.user.email, updated.user.firstName, updated).catch((err) => console.error('[EMAIL] order delivered failed:', err.message));
    }

    res.json(updated);
  } catch (err) { next(err); }
};
