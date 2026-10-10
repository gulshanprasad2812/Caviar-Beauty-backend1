import { prisma } from '../db.js';
import { AppError } from '../middleware/errorHandler.js';
import { Prisma } from '@prisma/client';

export const getCart = async (req, res, next) => {
  try {
    const items = await prisma.cartItem.findMany({
      where: { userId: req.user.id },
      include: { product: { include: { images: { where: { isPrimary: true }, take: 1 }, brand: true } } },
    });
    const variantIds = [...new Set(items.map((item) => item.variantId).filter(Boolean))];
    const variants = variantIds.length
      ? await prisma.productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, color: true, size: true, price: true } })
      : [];
    const variantById = new Map(variants.map((variant) => [variant.id, variant]));
    const itemsWithVariants = items.map((item) => ({ ...item, variant: variantById.get(item.variantId) || null }));
    const total = itemsWithVariants.reduce(
      (sum, item) => sum.plus((item.variant?.price ?? item.product.discountPrice ?? item.product.basePrice).times(item.quantity)),
      new Prisma.Decimal(0),
    );
    res.json({ items: itemsWithVariants, total });
  } catch (err) { next(err); }
};

export const addToCart = async (req, res, next) => {
  try {
    const { productId, variantId, quantity = 1 } = req.body;
    if (!productId) throw new AppError(400, 'Product is required');
    if (!Number.isInteger(quantity) || quantity < 1) throw new AppError(400, 'Quantity must be at least 1');
    const product = await prisma.product.findFirst({ where: { id: productId, isActive: true }, select: { id: true } });
    if (!product) throw new AppError(404, 'Product not found');
    if (variantId) {
      const variant = await prisma.productVariant.findFirst({ where: { id: variantId, productId, isActive: true }, select: { id: true } });
      if (!variant) throw new AppError(400, 'Invalid product variant');
    }
    const existing = await prisma.cartItem.findFirst({ where: { userId: req.user.id, productId, variantId: variantId || null } });
    if (existing) {
      const updated = await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: existing.quantity + quantity } });
      return res.json(updated);
    }
    const item = await prisma.cartItem.create({ data: { userId: req.user.id, productId, variantId: variantId || null, quantity } });
    res.status(201).json(item);
  } catch (err) { next(err); }
};

export const updateCartItem = async (req, res, next) => {
  try {
    const { quantity } = req.body;
    if (!Number.isInteger(quantity) || quantity < 1) throw new AppError(400, 'Quantity must be at least 1');
    const item = await prisma.cartItem.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!item) throw new AppError(404, 'Cart item not found');
    const updated = await prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });
    res.json(updated);
  } catch (err) { next(err); }
};

export const removeFromCart = async (req, res, next) => {
  try {
    await prisma.cartItem.deleteMany({ where: { id: req.params.id, userId: req.user.id } });
    res.json({ message: 'Item removed' });
  } catch (err) { next(err); }
};

export const clearCart = async (req, res, next) => {
  try {
    await prisma.cartItem.deleteMany({ where: { userId: req.user.id } });
    res.json({ message: 'Cart cleared' });
  } catch (err) { next(err); }
};
