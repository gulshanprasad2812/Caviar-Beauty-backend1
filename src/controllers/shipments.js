import { prisma } from '../db.js';
import { AppError } from '../middleware/errorHandler.js';
import { sendOrderShippedEmail, sendOrderDeliveredEmail } from '../services/email.js';

export const createShipment = async (req, res, next) => {
  try {
    const { carrier, trackingNumber, trackingUrl, estimatedDelivery } = req.body;
    const order = await prisma.order.findUnique({ where: { id: req.params.orderId }, include: { shipment: true } });
    if (!order) throw new AppError(404, 'Order not found');
    if (order.status === 'CANCELLED' || order.status === 'RETURNED') throw new AppError(400, 'Cannot ship a cancelled or returned order');
    if (!carrier || !trackingNumber) throw new AppError(400, 'Carrier and tracking number are required');

    const shipment = await prisma.shipment.upsert({
      where: { orderId: order.id },
      update: {
        carrier,
        trackingNumber,
        trackingUrl: trackingUrl || null,
        status: 'SHIPPED',
        shippedAt: new Date(),
        estimatedDelivery: estimatedDelivery || new Date(Date.now() + 5 * 86400000),
      },
      create: {
        orderId: order.id,
        carrier,
        trackingNumber,
        trackingUrl: trackingUrl || null,
        status: 'SHIPPED',
        shippedAt: new Date(),
        estimatedDelivery: estimatedDelivery || new Date(Date.now() + 5 * 86400000),
      },
    });

    const updatedOrder = await prisma.$transaction(async (tx) => {
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, status: 'SHIPPED', note: `Shipped via ${carrier}, tracking ${trackingNumber}` },
      });
      return tx.order.update({
        where: { id: order.id },
        data: { status: 'SHIPPED', trackingNumber, estimatedDelivery: shipment.estimatedDelivery },
        include: { user: { select: { email: true, firstName: true } } },
      });
    });

    if (updatedOrder.user?.email) {
      sendOrderShippedEmail(updatedOrder.user.email, updatedOrder.user.firstName, updatedOrder, shipment).catch((err) => console.error('[EMAIL] shipment notification failed:', err.message));
    }

    res.status(201).json({ shipment, order: updatedOrder });
  } catch (err) { next(err); }
};

export const markDelivered = async (req, res, next) => {
  try {
    const order = await prisma.order.findUnique({ where: { id: req.params.orderId }, include: { shipment: true } });
    if (!order) throw new AppError(404, 'Order not found');
    if (order.status !== 'SHIPPED') throw new AppError(400, 'Only shipped orders can be marked delivered');

    const updated = await prisma.$transaction(async (tx) => {
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, status: 'DELIVERED', note: 'Package delivered' },
      });
      await tx.shipment.update({
        where: { orderId: order.id },
        data: { status: 'DELIVERED', deliveredAt: new Date() },
      }).catch(() => {});
      return tx.order.update({
        where: { id: order.id },
        data: { status: 'DELIVERED', deliveredAt: new Date() },
        include: { user: { select: { email: true, firstName: true } } },
      });
    });

    if (updated.user?.email) {
      sendOrderDeliveredEmail(updated.user.email, updated.user.firstName, updated).catch((err) => console.error('[EMAIL] delivery notification failed:', err.message));
    }

    res.json(updated);
  } catch (err) { next(err); }
};