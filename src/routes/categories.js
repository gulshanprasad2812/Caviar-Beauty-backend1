import { Router } from 'express';
import { getCategories, getCategory, getAllCategoriesAdmin, createCategory, updateCategory, deleteCategory } from '../controllers/categories.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.get('/', getCategories);
router.get('/admin/all', authenticate, authorize('ADMIN'), getAllCategoriesAdmin);
router.post('/', authenticate, authorize('ADMIN'), createCategory);
router.put('/:id', authenticate, authorize('ADMIN'), updateCategory);
router.delete('/:id', authenticate, authorize('ADMIN'), deleteCategory);
router.get('/:slug', getCategory);

export default router;
