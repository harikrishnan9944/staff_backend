import { Response } from 'express';
import { Notification } from '../models/notification.model';
import { AuthRequest } from '../middlewares/auth.middleware';

// GET /api/notifications
export const getUserNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const notifications = await Notification.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await Notification.countDocuments({ userId: user._id, read: false });

    res.status(200).json({
      success: true,
      notifications,
      unreadCount,
    });
  } catch (error) {
    console.error('getUserNotifications error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PATCH /api/notifications/read
export const markNotificationsAsRead = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { notificationId, all } = req.body;

    if (all) {
      await Notification.updateMany({ userId: user._id, read: false }, { read: true });
    } else if (notificationId) {
      await Notification.updateOne({ _id: notificationId, userId: user._id }, { read: true });
    }

    res.status(200).json({
      success: true,
      message: 'Notifications marked as read',
    });
  } catch (error) {
    console.error('markNotificationsAsRead error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// DELETE /api/notifications/clear
export const clearUserNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    await Notification.deleteMany({ userId: user._id });

    res.status(200).json({
      success: true,
      message: 'Notifications cleared',
    });
  } catch (error) {
    console.error('clearUserNotifications error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/notifications/vapid-key
export const getVapidPublicKey = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const publicKey = process.env.VAPID_PUBLIC_KEY || '';
    res.status(200).json({
      success: true,
      publicKey,
    });
  } catch (error) {
    console.error('getVapidPublicKey error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/notifications/subscribe-web-push
export const subscribeWebPush = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { subscription, userAgent } = req.body;
    if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      res.status(400).json({ success: false, message: 'Invalid push subscription format' });
      return;
    }

    const { PushSubscription } = await import('../models/pushSubscription.model');

    // Upsert by endpoint
    await PushSubscription.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      {
        userId: user._id,
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
        userAgent: userAgent || req.headers['user-agent'] || '',
      },
      { upsert: true, new: true }
    );

    console.log(`[WebPush] Registered subscription for user '${user.username}'`);

    res.status(200).json({
      success: true,
      message: 'Web Push subscription stored successfully',
    });
  } catch (error) {
    console.error('subscribeWebPush error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/notifications/unsubscribe-web-push
export const unsubscribeWebPush = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { endpoint } = req.body;
    if (!endpoint) {
      res.status(400).json({ success: false, message: 'Endpoint is required' });
      return;
    }

    const { PushSubscription } = await import('../models/pushSubscription.model');
    await PushSubscription.deleteOne({ endpoint, userId: user._id });

    console.log(`[WebPush] Removed subscription for user '${user.username}'`);

    res.status(200).json({
      success: true,
      message: 'Web Push subscription removed successfully',
    });
  } catch (error) {
    console.error('unsubscribeWebPush error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/notifications/test-web-push
export const testWebPushNotification = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { sendNotificationToUser } = await import('../services/notification.service');
    const { title, body, url } = req.body || {};

    await sendNotificationToUser({
      recipientIds: [user._id.toString()],
      title: title || '🔔 Web Push Notification Test',
      message: body || 'Web push notification system is working perfectly on your browser!',
      category: 'System',
      priority: 'Normal',
      data: {
        type: 'test_push',
        url: url || '/',
        timestamp: new Date().toISOString(),
      },
    });

    res.status(200).json({
      success: true,
      message: 'Test Web Push notification triggered successfully',
    });
  } catch (error: any) {
    console.error('testWebPushNotification error:', error);
    res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
  }
};

