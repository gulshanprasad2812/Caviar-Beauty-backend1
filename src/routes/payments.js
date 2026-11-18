import { Router } from 'express';
import {
  createPaymentOrder,
  createPaymentSession,
  getPaymentSession,
  getPaymentSessionStatus,
  payPaymentSession,
  verifyPayment,
  getPaymentStatus,
  initiateRefund,
  getRefundStatus,
  paytmWebhook,
  paytmCallback,
  getPaymentConfig,
} from '../controllers/payments.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { storeLimiter, apiLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Public: reports whether the gateway is configured (never returns secrets).
router.get('/config', apiLimiter, getPaymentConfig);

// Public gateway endpoints. Paytm calls the callback from the customer's
// browser and the webhook server-to-server; neither can carry a CSRF token.
router.post('/callback', apiLimiter, paytmCallback);
router.post('/webhook/paytm', apiLimiter, paytmWebhook);

// Dummy QR flow: the checkout tab creates a session, the phone that scanned
// the QR reads and completes it. The unguessable token is the credential.
router.post('/session', authenticate, storeLimiter, createPaymentSession);
router.get('/session/:token', apiLimiter, getPaymentSession);
router.get('/session/:token/status', apiLimiter, getPaymentSessionStatus);
router.post('/session/:token/pay', storeLimiter, payPaymentSession);

router.post('/create-order', authenticate, storeLimiter, createPaymentOrder);
router.post('/verify', authenticate, storeLimiter, verifyPayment);
router.get('/:orderId/status', authenticate, apiLimiter, getPaymentStatus);
router.post('/:orderId/refund', authenticate, authorize('ADMIN'), apiLimiter, initiateRefund);
router.get('/:orderId/refund', authenticate, apiLimiter, getRefundStatus);

export default router;