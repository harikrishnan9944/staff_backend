import { Router } from 'express';
import {
  getPurchases,
  getPurchaseById,
  createPurchase,
  updatePurchase,
  deletePurchase,
  updateStatus,
  updateDelivery,
} from '../controllers/purchase.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.get('/', getPurchases);
router.get('/:id', getPurchaseById);

const allRoles = ['Admin', 'Manager', 'Head of Operations', 'Purchase Supervisor', 'Accountant', 'Supervisor', 'Architect', 'Staff'];

// Creation, modification and deletion endpoints (All roles allowed for testing)
router.post('/', authorize(allRoles), createPurchase);
router.put('/:id', authorize(allRoles), updatePurchase);
router.delete('/:id', authorize(allRoles), deletePurchase);

// Action endpoints: status transitions and delivery milestones
router.patch('/status', updateStatus);
router.patch('/delivery', updateDelivery);

export default router;
