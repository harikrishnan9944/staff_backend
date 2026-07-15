import { Router } from 'express';
import { getDashboardSummary, getAnalyticsData, getNotifications } from '../controllers/dashboard.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

// All dashboard endpoints require authentication
router.use(authenticate);

router.get('/summary', getDashboardSummary);
router.get('/analytics', getAnalyticsData);
router.get('/notifications', getNotifications);

export default router;
