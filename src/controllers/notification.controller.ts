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
