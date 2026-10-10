import { Router } from 'express';
import { createReview, getProductReviews, deleteReview, toggleReviewActive, listAllReviews } from '../controllers/reviews.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { storeLimiter, apiLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.get('/product/:productId', getProductReviews);
router.get('/admin/all', authenticate, authorize('ADMIN'), apiLimiter, listAllReviews);
router.post('/', authenticate, storeLimiter, createReview);
router.delete('/:id', authenticate, deleteReview);
router.put('/:id/active', authenticate, authorize('ADMIN'), toggleReviewActive);

export default router;
