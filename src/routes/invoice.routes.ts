import { Router } from 'express';
import {
  getInvoices,
  getInvoiceById,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  verifyInvoice,
} from '../controllers/invoice.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.get('/', getInvoices);
router.get('/:id', getInvoiceById);

// Create / Edit invoice attachments (Admin and Purchase Supervisor only)
router.post('/', authorize(['Admin', 'Purchase Supervisor']), createInvoice);
router.put('/:id', authorize(['Admin', 'Purchase Supervisor']), updateInvoice);

// Delete invoice entries (Admin only)
router.delete('/:id', authorize(['Admin']), deleteInvoice);

// Verify invoice status (Admin and Accountant only)
router.patch('/verify', authorize(['Admin', 'Accountant']), verifyInvoice);

export default router;
