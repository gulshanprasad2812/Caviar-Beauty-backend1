import { Router } from 'express';
import { getProducts, getProduct, searchProducts, getFeatured, getNewArrivals, getBestSellers, getAllProductsAdmin, createProduct, updateProduct, deleteProduct } from '../controllers/products.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.get('/', getProducts);
router.get('/search', searchProducts);
router.get('/featured', getFeatured);
router.get('/new-arrivals', getNewArrivals);
router.get('/best-sellers', getBestSellers);

router.get('/admin/all', authenticate, authorize('ADMIN'), getAllProductsAdmin);
router.post('/', authenticate, authorize('ADMIN'), createProduct);
router.put('/:id', authenticate, authorize('ADMIN'), updateProduct);
router.delete('/:id', authenticate, authorize('ADMIN'), deleteProduct);

router.get('/:slug', getProduct);

export default router;
