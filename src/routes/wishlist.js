import { Router } from 'express';
import { getWishlist, addToWishlist, removeFromWishlist, moveToCart } from '../controllers/wishlist.js';
import { authenticate } from '../middleware/auth.js';
import { storeLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.get('/', authenticate, getWishlist);
router.post('/', authenticate, storeLimiter, addToWishlist);
router.delete('/:id', authenticate, storeLimiter, removeFromWishlist);
router.post('/:id/move-to-cart', authenticate, storeLimiter, moveToCart);

export default router;
