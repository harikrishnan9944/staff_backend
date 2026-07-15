import { Router } from 'express';
import {
  getVendors,
  getVendorById,
  createVendor,
  updateVendor,
  deleteVendor,
} from '../controllers/vendor.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getVendors);
router.get('/:id', getVendorById);

router.post('/', authorize(['Admin', 'Purchase Supervisor', 'Manager']), createVendor);
router.put('/:id', authorize(['Admin', 'Purchase Supervisor', 'Manager']), updateVendor);
router.delete('/:id', authorize(['Admin']), deleteVendor);

export default router;
