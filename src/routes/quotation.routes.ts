import { Router } from 'express';
import { 
  getQuotations, 
  createQuotation, 
  updateQuotation, 
  deleteQuotation 
} from '../controllers/quotation.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

router.get('/', getQuotations);

// All mutation routes require authentication
router.use(authenticate);
router.post('/', createQuotation);
router.put('/:id', authorize(['Admin', 'Head of Operations', 'Manager', 'Architect', 'Staff', 'Supervisor', 'Purchase Supervisor']), updateQuotation);
router.delete('/:id', deleteQuotation);

export default router;
