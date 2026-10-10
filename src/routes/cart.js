import { Router } from 'express';
import { getCart, addToCart, updateCartItem, removeFromCart, clearCart } from '../controllers/cart.js';
import { authenticate } from '../middleware/auth.js';
import { storeLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.get('/', authenticate, getCart);
router.post('/', authenticate, storeLimiter, addToCart);
router.put('/:id', authenticate, storeLimiter, updateCartItem);
router.delete('/:id', authenticate, storeLimiter, removeFromCart);
router.delete('/', authenticate, clearCart);

export default router;
