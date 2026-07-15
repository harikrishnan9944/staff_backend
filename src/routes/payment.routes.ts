import { Router } from 'express';
import {
  getPayments,
  getPaymentById,
  createPayment,
  updatePayment,
  deletePayment,
} from '../controllers/payment.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getPayments);
router.get('/:id', getPaymentById);

// Payment editing restricted to Accountant and Admin only
router.post('/', authorize(['Admin', 'Accountant']), createPayment);
router.put('/:id', authorize(['Admin', 'Accountant']), updatePayment);
router.delete('/:id', authorize(['Admin']), deletePayment);

export default router;
