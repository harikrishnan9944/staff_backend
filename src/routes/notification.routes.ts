import { Router } from 'express';
import {
  getUserNotifications,
  markNotificationsAsRead,
  clearUserNotifications,
} from '../controllers/notification.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getUserNotifications);
router.patch('/read', markNotificationsAsRead);
router.delete('/clear', clearUserNotifications);

export default router;
