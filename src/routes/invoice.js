import { Router } from 'express';
import { downloadInvoice } from '../controllers/invoice.js';
import { authenticate } from '../middleware/auth.js';
import { storeLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.get('/orders/:id/invoice', authenticate, storeLimiter, downloadInvoice);

export default router;