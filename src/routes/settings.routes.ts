import { Router } from 'express';
import {
  getSettings,
  updateSettings,
} from '../controllers/settings.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getSettings);
router.put('/', authorize(['Admin']), updateSettings);

export default router;
