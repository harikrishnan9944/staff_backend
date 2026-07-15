import { Router } from 'express';
import {
  getAnalyticsData,
  exportReport,
  getExportHistory,
} from '../controllers/report.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/analytics', getAnalyticsData);
router.post('/export', exportReport);
router.get('/history', getExportHistory);

export default router;
