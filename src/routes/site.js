import { Router } from 'express';
import { getSiteSettings, updateSiteSettings } from '../controllers/site.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.get('/', getSiteSettings);
router.put('/', authenticate, authorize('ADMIN'), updateSiteSettings);

export default router;
