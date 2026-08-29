import { Router } from 'express';
import {
  getUserNotifications,
  markNotificationsAsRead,
  clearUserNotifications,
  getVapidPublicKey,
  subscribeWebPush,
  unsubscribeWebPush,
  testWebPushNotification,
} from '../controllers/notification.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getUserNotifications);
router.patch('/read', markNotificationsAsRead);
router.delete('/clear', clearUserNotifications);

router.get('/vapid-key', getVapidPublicKey);
router.post('/subscribe-web-push', subscribeWebPush);
router.post('/unsubscribe-web-push', unsubscribeWebPush);
router.post('/test-web-push', testWebPushNotification);

export default router;

