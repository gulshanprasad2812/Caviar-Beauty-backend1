import { Router } from 'express';
import { getBrands, getAllBrandsAdmin, createBrand, updateBrand, deleteBrand } from '../controllers/brands.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.get('/', getBrands);
router.get('/admin/all', authenticate, authorize('ADMIN'), getAllBrandsAdmin);
router.post('/', authenticate, authorize('ADMIN'), createBrand);
router.put('/:id', authenticate, authorize('ADMIN'), updateBrand);
router.delete('/:id', authenticate, authorize('ADMIN'), deleteBrand);

export default router;
