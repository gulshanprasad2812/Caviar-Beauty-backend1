import { Router } from 'express';
import { getTags, createTag, updateTag, deleteTag, getCollections, getCollection, createCollection, updateCollection, deleteCollection } from '../controllers/catalog.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.get('/tags', getTags);
router.get('/tags/admin/all', authenticate, authorize('ADMIN'), getTags);
router.post('/tags', authenticate, authorize('ADMIN'), createTag);
router.put('/tags/:id', authenticate, authorize('ADMIN'), updateTag);
router.delete('/tags/:id', authenticate, authorize('ADMIN'), deleteTag);

router.get('/collections', getCollections);
router.get('/collections/admin/all', authenticate, authorize('ADMIN'), getCollections);
router.get('/collections/:slug', getCollection);
router.post('/collections', authenticate, authorize('ADMIN'), apiLimiter, createCollection);
router.put('/collections/:id', authenticate, authorize('ADMIN'), updateCollection);
router.delete('/collections/:id', authenticate, authorize('ADMIN'), deleteCollection);

export default router;