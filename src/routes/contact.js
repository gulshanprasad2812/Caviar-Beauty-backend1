import { Router } from 'express';
import { createContactMessage, getContactMessages, markContactRead, deleteContactMessage } from '../controllers/contact.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/', apiLimiter, createContactMessage);
router.get('/', authenticate, authorize('ADMIN'), getContactMessages);
router.put('/:id/read', authenticate, authorize('ADMIN'), markContactRead);
router.delete('/:id', authenticate, authorize('ADMIN'), deleteContactMessage);

export default router;
