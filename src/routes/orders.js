import { Router } from 'express';
import { createOrder, getOrders, getOrder, cancelOrder, returnOrder, getAllOrders, updateOrderStatus } from '../controllers/orders.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { storeLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/', authenticate, storeLimiter, createOrder);
router.get('/', authenticate, getOrders);
router.get('/admin/all', authenticate, authorize('ADMIN'), getAllOrders);
router.get('/:id', authenticate, getOrder);
router.post('/:id/cancel', authenticate, storeLimiter, cancelOrder);
router.post('/:id/return', authenticate, storeLimiter, returnOrder);
router.put('/:id/status', authenticate, authorize('ADMIN'), updateOrderStatus);

export default router;
