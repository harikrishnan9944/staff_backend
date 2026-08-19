import { Types } from 'mongoose';
import { User } from '../models/user.model';
import { Notification } from '../models/notification.model';

export interface SendNotificationParams {
  recipientIds?: (string | Types.ObjectId)[];
  roles?: string[];
  title: string;
  message: string;
  category?: 'System' | 'Project' | 'Purchase' | 'Payment' | 'Material' | 'Vendor' | 'Quotation';
  priority?: 'Critical' | 'Normal' | 'Low';
  data?: Record<string, any>;
  excludeUserId?: string | Types.ObjectId;
}

/**
 * Centralized Push Notification & Internal Notification Service.
 *
 * Requirements satisfied:
 * - Triggers AFTER successful business operations.
 * - Complete failure isolation: Errors in notifications NEVER bubble up or roll back business transactions.
 * - Recipient deduplication: Ensures each user receives exactly 1 push notification per event.
 * - Centralized Expo Push API integration.
 */
export class NotificationService {
  /**
   * Dispatch automatic push & database notification to target users/roles.
   */
  public static async sendEventNotification(params: SendNotificationParams): Promise<void> {
    try {
      const {
        recipientIds = [],
        roles = [],
        title,
        message,
        category = 'System',
        priority = 'Normal',
        data = {},
        excludeUserId,
      } = params;

      // 1. Gather all target user IDs
      const targetUserIds = new Set<string>();

      // Add direct recipient IDs
      recipientIds.forEach((id) => {
        if (id) {
          targetUserIds.add(id.toString());
        }
      });

      // Query users by roles if specified, or broadcast if neither recipientIds nor roles given
      if (roles.length > 0) {
        const usersInRoles = await User.find(
          { role: { $in: roles }, isActive: true },
          '_id'
        ).lean();
        usersInRoles.forEach((u) => targetUserIds.add(u._id.toString()));
      } else if (recipientIds.length === 0) {
        const defaultUsers = await User.find(
          { role: { $in: ['Admin', 'Head of Operations', 'Manager', 'Staff'] }, isActive: true },
          '_id'
        ).lean();
        defaultUsers.forEach((u) => targetUserIds.add(u._id.toString()));
      }

      // If excludeUserId is explicitly provided, remove it, otherwise send to all target users
      if (excludeUserId) {
        targetUserIds.delete(excludeUserId.toString());
      }

      const finalUserIds = Array.from(targetUserIds);
      if (finalUserIds.length === 0) {
        console.log(`[NotificationService] No recipients found for notification: "${title}"`);
        return;
      }

      // 2. Fetch users with push token info
      const users = await User.find(
        { _id: { $in: finalUserIds }, isActive: true },
        '_id pushToken pushTokens'
      ).lean();

      const pushTokensSet = new Set<string>();
      const dbNotificationDocs: Array<any> = [];

      for (const u of users) {
        // Prepare DB Notification Document
        dbNotificationDocs.push({
          userId: u._id,
          title,
          message,
          category,
          priority,
          read: false,
          data,
        });

        // Collect push tokens
        if (u.pushToken && typeof u.pushToken === 'string' && u.pushToken.trim() !== '') {
          pushTokensSet.add(u.pushToken.trim());
        }
        if (Array.isArray(u.pushTokens)) {
          u.pushTokens.forEach((pt) => {
            if (pt && typeof pt === 'string' && pt.trim() !== '') {
              pushTokensSet.add(pt.trim());
            }
          });
        }
      }

      // 3. Save notifications to database for in-app feeds
      if (dbNotificationDocs.length > 0) {
        await Notification.insertMany(dbNotificationDocs);
      }

      // 4. Send Expo Push Notifications if push tokens exist
      const pushTokens = Array.from(pushTokensSet);
      if (pushTokens.length > 0) {
        await this.sendExpoPushNotifications(pushTokens, title, message, data);
      }

      console.log(
        `[NotificationService] Successfully processed notification "${title}" for ${finalUserIds.length} user(s) and ${pushTokens.length} push token(s).`
      );
    } catch (error) {
      // FAILURE ISOLATION: Log error and do NOT throw, ensuring business operation stays successful!
      console.error('[NotificationService] Failed to send push notification (isolated):', error);
    }
  }

  /**
   * Internal helper to dispatch payload to Expo Push Notification API.
   */
  private static async sendExpoPushNotifications(
    tokens: string[],
    title: string,
    body: string,
    data: Record<string, any>
  ): Promise<void> {
    try {
      const messages = tokens.map((token) => ({
        to: token,
        sound: 'default',
        title,
        body,
        data,
        priority: 'high',
      }));

      // Expo Push API endpoint
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });

      const responseData = await response.json();
      console.log('[NotificationService] Expo Push API response status:', response.status, responseData);
    } catch (err) {
      // Log Expo push failure without interrupting callers
      console.error('[NotificationService] Expo Push API request error (isolated):', err);
    }
  }
}

export const sendNotificationToUser = NotificationService.sendEventNotification.bind(NotificationService);
