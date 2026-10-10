import { Router } from 'express';
import { subscribe, getSubscribers, unsubscribe } from '../controllers/newsletter.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { apiLimiter, emailLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/', emailLimiter, subscribe);
router.post('/unsubscribe', apiLimiter, unsubscribe);
router.get('/', authenticate, authorize('ADMIN'), getSubscribers);

export default router;
