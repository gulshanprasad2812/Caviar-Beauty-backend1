import { Router } from 'express';
import { validateCoupon, createCoupon, getCoupons, updateCoupon, deleteCoupon } from '../controllers/coupons.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { storeLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/validate', storeLimiter, validateCoupon);
router.get('/', authenticate, authorize('ADMIN'), getCoupons);
router.post('/', authenticate, authorize('ADMIN'), createCoupon);
router.put('/:id', authenticate, authorize('ADMIN'), updateCoupon);
router.delete('/:id', authenticate, authorize('ADMIN'), deleteCoupon);

export default router;
