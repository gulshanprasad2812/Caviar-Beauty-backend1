import { Router } from 'express';
import { getUsers, getUser, updateUser, deleteUser, getDashboard, reactivateUser, updateUserRole } from '../controllers/users.js';
import { authenticate, authorize, requireOwnUserOrAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticate, authorize('ADMIN'), getUsers);
router.get('/dashboard', authenticate, getDashboard);
router.get('/:id', authenticate, requireOwnUserOrAdmin, getUser);
router.put('/:id', authenticate, requireOwnUserOrAdmin, updateUser);
router.put('/:id/role', authenticate, authorize('ADMIN'), updateUserRole);
router.put('/:id/reactivate', authenticate, authorize('ADMIN'), reactivateUser);
router.delete('/:id', authenticate, authorize('ADMIN'), deleteUser);

export default router;
