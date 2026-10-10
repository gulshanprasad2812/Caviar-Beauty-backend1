import { Router } from 'express';
import { createPaymentOrder, verifyPayment, getPaymentStatus, initiateRefund, getRefundStatus, razorpayWebhook } from '../controllers/payments.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { storeLimiter, apiLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/create-order', authenticate, storeLimiter, createPaymentOrder);
router.post('/verify', authenticate, storeLimiter, verifyPayment);
router.get('/:orderId/status', authenticate, apiLimiter, getPaymentStatus);
router.post('/:orderId/refund', authenticate, authorize('ADMIN'), apiLimiter, initiateRefund);
router.get('/:orderId/refund', authenticate, apiLimiter, getRefundStatus);
router.post('/webhook/razorpay', apiLimiter, razorpayWebhook);

export default router;
