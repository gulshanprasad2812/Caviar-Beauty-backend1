import { Router } from 'express';
import { getAddresses, createAddress, updateAddress, deleteAddress } from '../controllers/addresses.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticate, getAddresses);
router.post('/', authenticate, createAddress);
router.put('/:id', authenticate, updateAddress);
router.delete('/:id', authenticate, deleteAddress);

export default router;
