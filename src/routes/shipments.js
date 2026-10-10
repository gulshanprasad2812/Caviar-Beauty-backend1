import { Router } from 'express';
import { createShipment, markDelivered } from '../controllers/shipments.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/:orderId/ship', authenticate, authorize('ADMIN'), apiLimiter, createShipment);
router.post('/:orderId/deliver', authenticate, authorize('ADMIN'), apiLimiter, markDelivered);

export default router;