import { Router } from 'express';
import {
  createPage, deletePage, getAdminPage, getPublicPage,
  listAdminPages, listPublicPages, updatePage,
} from '../controllers/content.js';
import { authenticate, authorize, optionalAuth } from '../middleware/auth.js';

const router = Router();

// Storefront (published pages only, unless the reader is an admin)
router.get('/pages', listPublicPages);
router.get('/pages/:slug', optionalAuth, getPublicPage);

// Admin
router.get('/admin/pages', authenticate, authorize('ADMIN'), listAdminPages);
router.get('/admin/pages/:id', authenticate, authorize('ADMIN'), getAdminPage);
router.post('/pages', authenticate, authorize('ADMIN'), createPage);
router.put('/pages/:id', authenticate, authorize('ADMIN'), updatePage);
router.delete('/pages/:id', authenticate, authorize('ADMIN'), deletePage);

export default router;
