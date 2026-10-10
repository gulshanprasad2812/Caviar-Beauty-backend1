import { prisma } from '../db.js';
import { AppError } from '../middleware/errorHandler.js';
import { razorpay, isRazorpayConfigured, verifyPaymentSignature, verifyWebhookSignature, createRefund } from '../utils/razorpay.js';
import { sendRefundEmail } from '../services/email.js';
import { fulfillStock, releaseStock } from '../services/inventory.js';

export const createPaymentOrder = async (req, res, next) => {
  try {
    const { orderId } = req.body;
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.userId !== req.user.id) throw new AppError(404, 'Order not found');
    if (order.paymentStatus === 'COMPLETED') throw new AppError(400, 'Order already paid');
    if (!isRazorpayConfigured()) throw new AppError(503, 'Payment gateway is not configured');

    const amountPaise = order.total.times(100).round().toNumber();
    const rzpOrder = await razorpay.orders.create({
      amount: amountPaise,
      currency: order.currency,
      receipt: order.orderNumber,
      notes: { orderId: order.id },
    });

    await prisma.payment.upsert({
      where: { orderId: order.id },
      update: { transactionId: rzpOrder.id, method: 'Razorpay', amount: order.total, currency: order.currency, status: 'PENDING', gatewayResponse: JSON.stringify(rzpOrder) },
      create: { orderId: order.id, method: 'Razorpay', transactionId: rzpOrder.id, amount: order.total, currency: order.currency, status: 'PENDING', gatewayResponse: JSON.stringify(rzpOrder) },
    });

    res.json({ orderId: order.id, razorpayOrderId: rzpOrder.id, amount: order.total, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (err) { next(err); }
};

export const verifyPayment = async (req, res, next) => {
  try {
    const { orderId, razorpayOrderId, razorpayPaymentId, signature } = req.body;
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order || order.userId !== req.user.id) throw new AppError(404, 'Order not found');

    const payment = await prisma.payment.findUnique({ where: { orderId } });
    if (!payment || payment.transactionId !== razorpayOrderId || payment.status !== 'PENDING') {
      throw new AppError(400, 'Payment order does not match this order');
    }

    if (!verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, signature })) {
      throw new AppError(400, 'Payment verification failed');
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { orderId },
        data: { status: 'COMPLETED', transactionId: razorpayPaymentId, gatewayResponse: JSON.stringify({ razorpayOrderId, razorpayPaymentId }) },
      });
      await fulfillStock(tx, orderId, order.items);
      return tx.order.update({ where: { id: orderId }, data: { paymentStatus: 'COMPLETED', status: 'CONFIRMED' } });
    });

    res.json({ message: 'Payment verified successfully', order: updated });
  } catch (err) { next(err); }
};

export const getPaymentStatus = async (req, res, next) => {
  try {
    const order = await prisma.order.findFirst({ where: { id: req.params.orderId, userId: req.user.id }, select: { id: true, status: true, paymentStatus: true, payment: true } });
    if (!order) throw new AppError(404, 'Order not found');
    res.json(order);
  } catch (err) { next(err); }
};

export const initiateRefund = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body || {};

    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payment: true } });
    if (!order) throw new AppError(404, 'Order not found');
    if (!['CANCELLED', 'RETURNED'].includes(order.status)) throw new AppError(400, 'Only cancelled or returned orders can be refunded');
    if (!order.payment || order.payment.status !== 'COMPLETED') throw new AppError(400, 'No completed payment to refund');
    if (!isRazorpayConfigured() || !order.payment.transactionId) throw new AppError(503, 'Payment gateway is not configured for refunds');

    const existingRefund = await prisma.refund.findFirst({
      where: { orderId, status: { not: 'FAILED' } },
    });
    if (existingRefund) throw new AppError(400, 'Refund already initiated for this order');

    const amount = order.total;
    let refundRecord;
    let gatewayRefundId = null;
    let gatewayResponse = null;

    if (isRazorpayConfigured() && order.payment.transactionId) {
      try {
        const rzpRefund = await createRefund({
          paymentId: order.payment.transactionId,
          amount,
          notes: { orderId: order.id, orderNumber: order.orderNumber, reason: reason || 'Cancellation/Return refund' },
        });
        gatewayRefundId = rzpRefund.id;
        gatewayResponse = JSON.stringify(rzpRefund);
      } catch (err) {
        const failed = await prisma.refund.create({
          data: {
            orderId,
            paymentId: order.payment.id,
            amount,
            currency: order.currency,
            status: 'FAILED',
            reason: reason || null,
            initiatedBy: req.user.id,
            gatewayResponse: JSON.stringify({ error: err.message }),
          },
        });
        return res.status(502).json({ error: 'Refund failed at payment gateway', refund: failed });
      }
    }

    refundRecord = await prisma.refund.create({
      data: {
        orderId,
        paymentId: order.payment.id,
        amount,
        currency: order.currency,
        status: gatewayRefundId ? 'PENDING' : 'PROCESSED',
        reason: reason || null,
        initiatedBy: req.user.id,
        razorpayRefundId: gatewayRefundId,
        gatewayResponse,
        ...(gatewayRefundId ? {} : { processedAt: new Date() }),
      },
    });

    await prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus: gatewayRefundId ? 'REFUNDING' : 'REFUNDED' },
    });

    const user = await prisma.user.findUnique({ where: { id: order.userId }, select: { email: true, firstName: true } });
    if (user) {
      sendRefundEmail(user.email, user.firstName, order, refundRecord).catch((err) => console.error('[EMAIL] refund notification failed:', err.message));
    }

    res.json({ message: gatewayRefundId ? 'Refund initiated' : 'Refund recorded', refund: refundRecord });
  } catch (err) { next(err); }
};

export const getRefundStatus = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.userId !== req.user.id) throw new AppError(404, 'Order not found');
    const refund = await prisma.refund.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ refund });
  } catch (err) { next(err); }
};

export const razorpayWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = req.rawBody || JSON.stringify(req.body);

    if (!verifyWebhookSignature(rawBody, signature)) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const payload = JSON.parse(rawBody);
    const { event } = payload;

    if (event === 'payment.captured' || event === 'order.paid') {
      const rzpOrderId = payload?.payload?.order?.entity?.id || payload?.payload?.payment?.entity?.order_id;
      if (rzpOrderId) {
        const payment = await prisma.payment.findFirst({ where: { transactionId: rzpOrderId }, include: { order: { include: { items: true } } } });
        if (payment && payment.status !== 'COMPLETED') {
          await prisma.$transaction(async (tx) => {
            await tx.payment.update({ where: { id: payment.id }, data: { status: 'COMPLETED', gatewayResponse: JSON.stringify(payload) } });
            await tx.order.update({ where: { id: payment.orderId }, data: { paymentStatus: 'COMPLETED', status: 'CONFIRMED' } });
            await fulfillStock(tx, payment.orderId, payment.order.items);
          });
        }
      }
    }

    if (event === 'payment.failed') {
      const rzpOrderId = payload?.payload?.payment?.entity?.order_id;
      if (rzpOrderId) {
        const payment = await prisma.payment.findFirst({ where: { transactionId: rzpOrderId }, include: { order: { include: { items: true } } } });
        if (payment) {
          await prisma.$transaction(async (tx) => {
            await tx.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', gatewayResponse: JSON.stringify(payload) } });
            await releaseStock(tx, payment.orderId, payment.order.items.map((i) => ({ ...i, orderPaid: false })));
          });
        }
      }
    }

    if (event === 'refund.processed' || event === 'refund.created') {
      const refundEntity = payload?.payload?.refund?.entity;
      const refundId = refundEntity?.id;
      if (refundId) {
        const refund = await prisma.refund.findFirst({ where: { razorpayRefundId: refundId } });
        if (refund) {
          await prisma.$transaction(async (tx) => {
            await tx.refund.update({
              where: { id: refund.id },
              data: { status: 'PROCESSED', processedAt: new Date(), gatewayResponse: JSON.stringify(payload) },
            });
            await tx.order.update({ where: { id: refund.orderId }, data: { paymentStatus: 'REFUNDED' } });
          });
        }
      }
    }

    if (event === 'refund.failed') {
      const refundId = payload?.payload?.refund?.entity?.id;
      if (refundId) {
        const refund = await prisma.refund.findFirst({ where: { razorpayRefundId: refundId } });
        if (refund) {
          await prisma.$transaction(async (tx) => {
            await tx.refund.update({
              where: { id: refund.id },
              data: { status: 'FAILED', gatewayResponse: JSON.stringify(payload) },
            });
            await tx.order.update({ where: { id: refund.orderId }, data: { paymentStatus: 'COMPLETED' } });
          });
        }
      }
    }

    res.json({ received: true });
  } catch {
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};
