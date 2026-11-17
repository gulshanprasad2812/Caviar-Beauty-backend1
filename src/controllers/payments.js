import { prisma } from '../db.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  createRefund,
  getCheckoutScriptUrl,
  getMid,
  getPublicPaymentConfig,
  getTransactionStatus,
  getWebsiteName,
  initiateTransaction,
  isPaytmConfigured,
  verifyCallbackChecksum,
  verifyWebhookSignature,
} from '../utils/paytm.js';
import { sendRefundEmail } from '../services/email.js';
import { fulfillStock, releaseStock } from '../services/inventory.js';

/** Paytm allows alphanumerics plus @ - _ . in an order id, max 50 characters. */
const toPaytmOrderId = (order) => {
  const fromNumber = String(order.orderNumber || '')
    .replace(/[^A-Za-z0-9@\-_.]/g, '')
    .slice(0, 50);
  if (fromNumber.length >= 4) return fromNumber;
  return `CB${String(order.id).replace(/-/g, '')}`.slice(0, 50);
};

/** Paytm's transaction id is stored alongside the merchant order id in gatewayResponse. */
const gatewaySnapshot = (payment) => {
  try {
    return JSON.parse(payment?.gatewayResponse || '{}') || {};
  } catch {
    return {};
  }
};

const describeResult = (result) => ({
  resultInfo: result?.resultInfo || null,
  txnId: result?.txnId || null,
  bankTxnId: result?.bankTxnId || null,
  bankName: result?.bankName || null,
  gatewayName: result?.gatewayName || null,
  paymentMode: result?.paymentMode || null,
  txnDate: result?.txnDate || null,
  txnAmount: result?.txnAmount || null,
});

/**
 * Marks a pending payment as captured and moves the reserved stock to sold.
 * Idempotent: safe to call from the verify route, callback and webhook.
 */
const markPaymentCompleted = async (order, result, source) => {
  const payment = await prisma.payment.findUnique({ where: { orderId: order.id } });
  if (!payment) throw new AppError(400, 'Payment record not found');
  if (payment.status === 'COMPLETED') {
    return prisma.order.findUnique({ where: { id: order.id } });
  }

  return prisma.$transaction(async (tx) => {
    // Claim the payment atomically so a callback and a webhook arriving at the
    // same time cannot both fulfil the same stock.
    const claimed = await tx.payment.updateMany({
      where: { orderId: order.id, status: 'PENDING' },
      data: { status: 'PROCESSING' },
    });
    if (claimed.count === 0) {
      return tx.order.findUnique({ where: { id: order.id } });
    }

    await tx.payment.update({
      where: { orderId: order.id },
      data: {
        status: 'COMPLETED',
        gatewayResponse: JSON.stringify({
          orderId: payment.transactionId,
          ...describeResult(result),
          source,
        }),
      },
    });
    await fulfillStock(tx, order.id, order.items);

    const history = await tx.orderStatusHistory.findFirst({
      where: { orderId: order.id, status: 'CONFIRMED' },
    });
    if (!history) {
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, status: 'CONFIRMED', note: `Payment received via Paytm (${source})` },
      });
    }

    return tx.order.update({
      where: { id: order.id },
      data: { paymentStatus: 'COMPLETED', status: 'CONFIRMED' },
    });
  });
};

/**
 * Marks the payment failed and releases the stock reservation. The order is
 * cancelled so a retry starts from a clean reservation instead of overselling.
 */
const markPaymentFailed = async (order, result, source) => {
  const payment = await prisma.payment.findUnique({ where: { orderId: order.id } });
  if (!payment) return;
  if (payment.status === 'COMPLETED') return;

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({
      where: { orderId: order.id, status: 'PENDING' },
      data: { status: 'FAILED' },
    });
    if (claimed.count === 0) return;

    await tx.payment.update({
      where: { orderId: order.id },
      data: {
        gatewayResponse: JSON.stringify({
          orderId: payment.transactionId,
          resultInfo: result?.resultInfo || null,
          source,
        }),
      },
    });
    await releaseStock(
      tx,
      order.id,
      order.items.map((item) => ({ ...item, orderPaid: false }))
    );
    await tx.order.update({
      where: { id: order.id },
      data: { paymentStatus: 'FAILED', status: 'CANCELLED' },
    });

    const history = await tx.orderStatusHistory.findFirst({
      where: { orderId: order.id, status: 'CANCELLED' },
    });
    if (!history) {
      await tx.orderStatusHistory.create({
        data: { orderId: order.id, status: 'CANCELLED', note: `Payment failed via Paytm (${source})` },
      });
    }
  });
};

/** Creates (or reuses) the transaction token that Paytm JS Checkout needs. */
export const createPaymentOrder = async (req, res, next) => {
  try {
    const { orderId } = req.body;
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true } } },
    });
    if (!order || order.userId !== req.user.id) throw new AppError(404, 'Order not found');
    if (order.paymentStatus === 'COMPLETED') throw new AppError(400, 'Order already paid');
    if (order.status === 'CANCELLED') throw new AppError(400, 'This order was cancelled. Please place a new order.');
    if (!isPaytmConfigured()) throw new AppError(503, 'Payment gateway is not configured');

    const existingPayment = await prisma.payment.findUnique({ where: { orderId: order.id } });
    const canReuse =
      existingPayment?.status === 'PENDING' &&
      Boolean(existingPayment.transactionId) &&
      existingPayment.amount.toString() === order.total.toString();
    const paytmOrderId = canReuse ? existingPayment.transactionId : toPaytmOrderId(order);
    const reused = Boolean(
      existingPayment?.status === 'PENDING' && existingPayment.transactionId === paytmOrderId
    );

    const initiated = await initiateTransaction({
      orderId: paytmOrderId,
      amount: order.total,
      customerId: order.userId,
      email: order.user?.email,
      mobile: order.user?.phone || undefined,
      firstName: order.user?.firstName,
      lastName: order.user?.lastName,
    });

    const summary = JSON.stringify({ orderId: paytmOrderId, resultInfo: initiated.resultInfo || null });

    await prisma.payment.upsert({
      where: { orderId: order.id },
      update: {
        transactionId: paytmOrderId,
        method: 'Paytm',
        amount: order.total,
        currency: order.currency,
        status: 'PENDING',
        gatewayResponse: summary,
      },
      create: {
        orderId: order.id,
        method: 'Paytm',
        transactionId: paytmOrderId,
        amount: order.total,
        currency: order.currency,
        status: 'PENDING',
        gatewayResponse: summary,
      },
    });

    res.json({
      orderId: order.id,
      paytmOrderId,
      txnToken: initiated.txnToken,
      amount: order.total,
      currency: order.currency,
      mid: getMid(),
      websiteName: getWebsiteName(),
      checkoutScriptUrl: getCheckoutScriptUrl(),
      mode: getPublicPaymentConfig().mode,
      reused,
    });
  } catch (err) {
    if (err instanceof AppError) return next(err);
    return next(new AppError(502, `Could not start Paytm checkout: ${err.message}`));
  }
};

/** Public, unauthenticated: lets the storefront reflect real payment state. */
export const getPaymentConfig = (_req, res) => {
  res.json(getPublicPaymentConfig());
};

/**
 * Verifies a payment with Paytm's Transaction Status API. The browser cannot be
 * trusted to report success; only the server-to-server status response is.
 */
export const verifyPayment = async (req, res, next) => {
  try {
    const { orderId } = req.body;
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order || order.userId !== req.user.id) throw new AppError(404, 'Order not found');

    const payment = await prisma.payment.findUnique({ where: { orderId } });
    if (!payment) throw new AppError(400, 'No payment was started for this order');

    if (payment.status === 'COMPLETED') {
      return res.json({
        message: 'Payment already verified',
        alreadyPaid: true,
        order: await prisma.order.findUnique({ where: { id: order.id } }),
      });
    }
    if (payment.status !== 'PENDING') {
      throw new AppError(400, 'This payment is no longer pending');
    }
    if (!isPaytmConfigured()) throw new AppError(503, 'Payment gateway is not configured');

    const result = await getTransactionStatus(payment.transactionId);
    const resultInfo = result?.resultInfo || {};

    if (result?.orderId && result.orderId !== payment.transactionId) {
      throw new AppError(400, 'Paytm returned a different order id');
    }

    if (resultInfo.resultStatus === 'TXN_SUCCESS') {
      const paid = Number(result.txnAmount);
      const expected = Number(order.total);
      if (!Number.isFinite(paid) || Math.abs(paid - expected) > 0.01) {
        throw new AppError(400, 'Paid amount does not match the order total');
      }
      const updated = await markPaymentCompleted(order, result, 'verify');
      return res.json({ message: 'Payment verified successfully', order: updated });
    }

    if (resultInfo.resultStatus === 'TXN_FAILURE' || resultInfo.resultStatus === 'NO_RECORD_FOUND') {
      await markPaymentFailed(order, result, 'verify');
      throw new AppError(400, resultInfo.resultMsg || 'Payment failed');
    }

    return res.status(202).json({
      message: 'Payment is still pending with Paytm',
      pending: true,
      status: resultInfo.resultStatus || 'PENDING',
      orderId: order.id,
    });
  } catch (err) {
    if (err instanceof AppError) return next(err);
    return next(new AppError(502, `Could not verify the Paytm payment: ${err.message}`));
  }
};

export const getPaymentStatus = async (req, res, next) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.orderId, userId: req.user.id },
      select: { id: true, status: true, paymentStatus: true, payment: true },
    });
    if (!order) throw new AppError(404, 'Order not found');
    res.json(order);
  } catch (err) {
    next(err);
  }
};

/** Resolves the internal order id from a Paytm merchant order id. */
const findOrderByPaytmOrderId = async (paytmOrderId) => {
  if (!paytmOrderId) return null;
  const payment = await prisma.payment.findFirst({
    where: { transactionId: paytmOrderId },
    include: { order: { include: { items: true } } },
  });
  return payment ? { payment, order: payment.order } : null;
};

const frontendOrigin = () => (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');

/**
 * Public browser return endpoint. Paytm POSTs form-encoded transaction details
 * here after checkout; the checksum is verified and the browser is redirected
 * back to the storefront.
 */
export const paytmCallback = async (req, res) => {
  const fallback = `${frontendOrigin()}/checkout`;
  let redirectTo = `${fallback}?payment=error`;
  try {
    const params = { ...(req.body || {}) };
    const valid = await verifyCallbackChecksum(params);
    const match = await findOrderByPaytmOrderId(params.ORDERID);

    if (match) redirectTo = `${frontendOrigin()}/orders/${match.order.id}?payment=pending`;
    if (!valid) {
      return res.redirect(303, `${match ? `${frontendOrigin()}/orders/${match.order.id}` : fallback}?payment=invalid`);
    }
    if (!match) return res.redirect(303, `${fallback}?payment=unknown`);

    const status = String(params.STATUS || '').toUpperCase();
    if (status === 'TXN_SUCCESS') {
      // The callback is only a hint: confirm against the status API.
      const verified = await getTransactionStatus(match.payment.transactionId).catch(() => null);
      if (verified?.resultInfo?.resultStatus === 'TXN_SUCCESS') {
        await markPaymentCompleted(match.order, verified, 'callback');
        return res.redirect(303, `${frontendOrigin()}/orders/${match.order.id}?payment=success`);
      }
      return res.redirect(303, `${frontendOrigin()}/orders/${match.order.id}?payment=pending`);
    }

    if (status === 'TXN_FAILURE') {
      await markPaymentFailed(
        match.order,
        {
          resultInfo: {
            resultStatus: status,
            resultCode: params.RESPCODE || null,
            resultMsg: params.RESPMSG || null,
          },
        },
        'callback'
      );
      return res.redirect(303, `${frontendOrigin()}/orders/${match.order.id}?payment=failed`);
    }

    return res.redirect(303, `${frontendOrigin()}/orders/${match.order.id}?payment=pending`);
  } catch {
    return res.redirect(303, redirectTo);
  }
};

/**
 * Server-to-server webhook. Handles both the JSON `{ head, body }` format and
 * the legacy key/value format, for payments and refund statuses.
 */
export const paytmWebhook = async (req, res) => {
  try {
    const payload = req.body || {};
    let data;
    let valid = false;

    if (payload.head?.signature && payload.body) {
      valid = await verifyWebhookSignature(payload.body, payload.head.signature);
      data = { ...payload.body };
    } else {
      data = { ...payload };
      valid = await verifyCallbackChecksum(data);
      const hashKey = Object.keys(data).find((key) => key.toUpperCase() === 'CHECKSUMHASH');
      if (hashKey) delete data[hashKey];
    }

    if (!valid) return res.status(400).json({ error: 'Invalid signature' });

    const paytmOrderId = data.orderId || data.ORDERID;
    const resultInfo = data.resultInfo || {
      resultStatus: data.STATUS || data.status || null,
      resultCode: data.RESPCODE || null,
      resultMsg: data.RESPMSG || null,
    };
    const resultStatus = String(resultInfo.resultStatus || '').toUpperCase();

    // Refund events carry a refundId/refId and are tied to the original order.
    const refundRef = data.refundId || data.REFUNDID || data.refId || data.REFID;
    if (refundRef) {
      const match = await findOrderByPaytmOrderId(paytmOrderId);
      if (match) {
        const refund = await prisma.refund.findFirst({
          where: { orderId: match.order.id },
          orderBy: { createdAt: 'desc' },
        });
        if (refund) {
          const succeeded = ['TXN_SUCCESS', 'SUCCESS', 'REFUND_SUCCESS'].includes(resultStatus);
          await prisma.$transaction(async (tx) => {
            await tx.refund.update({
              where: { id: refund.id },
              data: {
                status: succeeded ? 'PROCESSED' : 'FAILED',
                processedAt: succeeded ? new Date() : null,
                gatewayResponse: JSON.stringify(data),
              },
            });
            await tx.order.update({
              where: { id: refund.orderId },
              data: { paymentStatus: succeeded ? 'REFUNDED' : 'COMPLETED' },
            });
          });
        }
      }
      return res.json({ received: true });
    }

    if (!paytmOrderId) return res.json({ received: true });
    const match = await findOrderByPaytmOrderId(paytmOrderId);
    if (!match) return res.json({ received: true });

    if (resultStatus === 'TXN_SUCCESS') {
      // Confirm with the status API: webhook bodies are not accepted on their own.
      const verified = await getTransactionStatus(paytmOrderId).catch(() => null);
      if (verified?.resultInfo?.resultStatus === 'TXN_SUCCESS') {
        await markPaymentCompleted(match.order, verified, 'webhook');
      }
    } else if (resultStatus === 'TXN_FAILURE' || resultStatus === 'TXN_FAILED') {
      await markPaymentFailed(match.order, { resultInfo }, 'webhook');
    }

    return res.json({ received: true });
  } catch {
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
};

export const initiateRefund = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body || {};

    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payment: true } });
    if (!order) throw new AppError(404, 'Order not found');
    if (!['CANCELLED', 'RETURNED'].includes(order.status)) {
      throw new AppError(400, 'Only cancelled or returned orders can be refunded');
    }
    if (!order.payment || order.payment.status !== 'COMPLETED') {
      throw new AppError(400, 'No completed payment to refund');
    }
    if (!isPaytmConfigured()) throw new AppError(503, 'Payment gateway is not configured for refunds');

    const snapshot = gatewaySnapshot(order.payment);
    const txnId = snapshot.txnId || null;
    if (!txnId) throw new AppError(400, 'Paytm transaction id is missing for this payment');

    const existingRefund = await prisma.refund.findFirst({
      where: { orderId, status: { not: 'FAILED' } },
    });
    if (existingRefund) throw new AppError(400, 'Refund already initiated for this order');

    const amount = order.total;
    const refId = `RF${String(order.orderNumber || order.id).replace(/[^A-Za-z0-9]/g, '')}${Date.now()}`
      .slice(0, 50);

    let gatewayRefund;
    try {
      gatewayRefund = await createRefund({
        orderId: order.payment.transactionId,
        txnId,
        refId,
        amount,
        comments: reason || 'Cancellation/Return refund',
      });
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
          gatewayResponse: JSON.stringify({ error: err.message, refId }),
        },
      });
      return res.status(502).json({ error: 'Refund failed at payment gateway', refund: failed });
    }

    const resultInfo = gatewayRefund?.resultInfo || {};
    const accepted = resultInfo.resultStatus === 'PENDING' || resultInfo.resultStatus === 'TXN_SUCCESS';

    const refundRecord = await prisma.refund.create({
      data: {
        orderId,
        paymentId: order.payment.id,
        amount,
        currency: order.currency,
        status: accepted ? (resultInfo.resultStatus === 'TXN_SUCCESS' ? 'PROCESSED' : 'PENDING') : 'FAILED',
        reason: reason || null,
        initiatedBy: req.user.id,
        paytmRefundId: gatewayRefund?.refundId || null,
        paytmRefId: refId,
        gatewayResponse: JSON.stringify(gatewayRefund || {}),
        ...(resultInfo.resultStatus === 'TXN_SUCCESS' ? { processedAt: new Date() } : {}),
      },
    });

    await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus:
          resultInfo.resultStatus === 'TXN_SUCCESS' ? 'REFUNDED' : accepted ? 'REFUNDING' : 'COMPLETED',
      },
    });

    const user = await prisma.user.findUnique({
      where: { id: order.userId },
      select: { email: true, firstName: true },
    });
    if (user) {
      sendRefundEmail(user.email, user.firstName, order, refundRecord).catch((err) =>
        console.error('[EMAIL] refund notification failed:', err.message)
      );
    }

    if (!accepted) {
      return res.status(502).json({
        error: resultInfo.resultMsg || 'Paytm rejected the refund',
        refund: refundRecord,
      });
    }

    res.json({
      message: resultInfo.resultStatus === 'TXN_SUCCESS' ? 'Refund processed' : 'Refund initiated',
      refund: refundRecord,
    });
  } catch (err) {
    next(err);
  }
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
  } catch (err) {
    next(err);
  }
};