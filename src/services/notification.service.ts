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

      // ALWAYS add ALL active Admin users! Every Admin user MUST receive notifications for ALL events across the system!
      const adminUsers = await User.find(
        { role: 'Admin', isActive: { $ne: false } },
        '_id'
      ).lean();
      const adminIdSet = new Set<string>();
      adminUsers.forEach((u) => {
        const adminIdStr = u._id.toString();
        targetUserIds.add(adminIdStr);
        adminIdSet.add(adminIdStr);
      });

      // Add direct recipient IDs
      recipientIds.forEach((id) => {
        if (id) {
          targetUserIds.add(id.toString());
        }
      });

      // If specific roles are specified:
      // When recipientIds are explicitly passed for a project event, filter roles so only oversight roles (Admin, Manager, Head of Operations) are added system-wide, while Staff users are restricted to those in recipientIds.
      if (roles && roles.length > 0) {
        let filterRoles = roles;
        if (recipientIds.length > 0) {
          filterRoles = roles.filter((r) => ['Admin', 'Manager', 'Head of Operations'].includes(r));
        }
        if (filterRoles.length > 0) {
          const usersByRole = await User.find(
            { role: { $in: filterRoles }, isActive: { $ne: false } },
            '_id'
          ).lean();
          usersByRole.forEach((u) => targetUserIds.add(u._id.toString()));
        }
      }

      // If target set is empty, broadcast to oversight roles (Admin, Manager, Head of Operations)
      if (targetUserIds.size === 0) {
        const oversightUsers = await User.find(
          { role: { $in: ['Admin', 'Manager', 'Head of Operations'] }, isActive: { $ne: false } },
          '_id'
        ).lean();
        oversightUsers.forEach((u) => targetUserIds.add(u._id.toString()));
      }

      // Exclude performer ONLY if they are NOT an Admin (Admin users must ALWAYS receive notifications)
      if (excludeUserId) {
        const excludeStr = excludeUserId.toString();
        if (!adminIdSet.has(excludeStr)) {
          targetUserIds.delete(excludeStr);
        }
      }

      const finalUserIds = Array.from(targetUserIds);
      if (finalUserIds.length === 0) {
        console.log(`[NotificationService] No recipients found for notification: "${title}"`);
        return;
      }

      // 2. Fetch users with push token info
      const users = await User.find(
        { _id: { $in: finalUserIds }, isActive: { $ne: false } },
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

      console.log(`NOTIFICATION TRIGGERED: "${title}"`);
      console.log(`RECIPIENT USER IDS: [${finalUserIds.join(', ')}]`);
      console.log(`RECIPIENT PUSH TOKENS: [${Array.from(pushTokensSet).join(', ')}]`);

      // 3. Save notifications to database for in-app feeds
      if (dbNotificationDocs.length > 0) {
        await Notification.insertMany(dbNotificationDocs);
      }

      // 4. Send Expo Push Notifications if push tokens exist
      const pushTokens = Array.from(pushTokensSet);
      if (pushTokens.length > 0) {
        await this.sendExpoPushNotifications(pushTokens, title, message, data);
      } else {
        console.log('[NotificationService] No Expo push tokens found for recipients.');
      }

      // 5. Send Web Push Notifications to browser subscriptions
      await this.sendWebPushNotifications(finalUserIds, title, message, data);
    } catch (error) {
      // FAILURE ISOLATION: Log error and do NOT throw, ensuring business operation stays successful!
      console.error('[NotificationService] Failed to send push notification (isolated):', error);
    }
  }

  /**
   * Internal helper to dispatch Web Push Notifications via web-push / VAPID.
   */
  private static async sendWebPushNotifications(
    userIds: string[],
    title: string,
    body: string,
    data: Record<string, any>
  ): Promise<void> {
    try {
      const publicKey = process.env.VAPID_PUBLIC_KEY;
      const privateKey = process.env.VAPID_PRIVATE_KEY;
      const subject = process.env.VAPID_SUBJECT || 'mailto:admin@staffmanagement.com';

      if (!publicKey || !privateKey) {
        console.warn('[NotificationService] VAPID keys not configured in environment. Skipping Web Push.');
        return;
      }

      const { PushSubscription } = await import('../models/pushSubscription.model');
      const webpush = (await import('web-push')).default;

      webpush.setVapidDetails(subject, publicKey, privateKey);

      const objectIds = userIds.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
      const subscriptions = await PushSubscription.find({
        $or: [{ userId: { $in: objectIds } }, { userId: { $in: userIds } }],
      });
      if (!subscriptions || subscriptions.length === 0) {
        console.log('[NotificationService] No Web Push subscriptions found for recipient users.');
        return;
      }

      console.log(`[WebPush] Dispatching to ${subscriptions.length} web push subscription(s)...`);

      const payload = JSON.stringify({
        title,
        body,
        icon: data?.icon || '/globe.svg',
        url: data?.url || '/',
        data: data || {},
        timestamp: Date.now(),
      });

      const sendPromises = subscriptions.map(async (sub) => {
        const pushSub = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.keys.p256dh,
            auth: sub.keys.auth,
          },
        };

        try {
          await webpush.sendNotification(pushSub, payload);
          console.log(`[WebPush] Successfully sent to subscription endpoint: ${sub.endpoint.slice(0, 30)}...`);
        } catch (err: any) {
          console.error(`[WebPush] Delivery error for endpoint ${sub.endpoint.slice(0, 30)}...:`, err.statusCode || err.message);
          // If subscription is expired or invalid (404 or 410), prune it from database
          if (err.statusCode === 404 || err.statusCode === 410) {
            console.log(`[WebPush] Pruning expired subscription endpoint: ${sub.endpoint.slice(0, 30)}...`);
            await PushSubscription.deleteOne({ _id: sub._id });
          }
        }
      });

      await Promise.allSettled(sendPromises);
    } catch (err) {
      console.error('[NotificationService] Error sending Web Push notifications (isolated):', err);
    }
  }


  /**
   * Helper to fetch user IDs involved in a project:
   * 1. Users assigned directly in Project.assignedUsers
   * 2. Users in ProjectMember collection for this project
   * 3. System-wide oversight roles (Admin, Head of Operations, Manager)
   * Note: Staff users NOT assigned to this project are strictly excluded.
   */
  public static async getProjectInvolvedUserIds(projectId?: string | Types.ObjectId): Promise<string[]> {
    const userIds = new Set<string>();
    try {
      if (projectId) {
        const { Project } = await import('../models/project.model');
        const { ProjectMember } = await import('../models/projectMember.model');

        const project = await Project.findById(projectId).select('assignedUsers').lean();
        if (project && project.assignedUsers) {
          project.assignedUsers.forEach((uId: any) => {
            if (uId) userIds.add(uId.toString());
          });
        }

        const members = await ProjectMember.find({ projectId }).select('userId').lean();
        members.forEach((m: any) => {
          if (m.userId) userIds.add(m.userId.toString());
        });
      }

      // Include oversight management roles system-wide (Admin, Manager, Head of Operations)
      const oversightUsers = await User.find(
        { role: { $in: ['Admin', 'Manager', 'Head of Operations'] }, isActive: { $ne: false } },
        '_id'
      ).lean();
      oversightUsers.forEach((u) => userIds.add(u._id.toString()));
    } catch (err) {
      console.error('[NotificationService] Error resolving recipient IDs:', err);
    }
    return Array.from(userIds);
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
      // Validate push tokens format
      const validTokens = tokens.filter(
        (t) => typeof t === 'string' && t.trim().length > 0 && (t.startsWith('ExponentPushToken') || t.startsWith('ExpoPushToken') || t.includes('['))
      );

      if (validTokens.length === 0) {
        console.log('[NotificationService] No valid push tokens to dispatch.');
        return;
      }

      console.log(`EXPO PUSH REQUEST STARTED for ${validTokens.length} token(s)`);

      const messages = validTokens.map((token) => ({
        to: token,
        sound: 'default',
        title,
        body,
        data,
        priority: 'high',
        channelId: 'default',
        badge: 1,
        _displayInForeground: true,
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

      const responseData: any = await response.json();
      console.log(`EXPO RESPONSE: Status ${response.status}`, JSON.stringify(responseData));

      // Parse tickets and safely prune unregistered tokens from DB
      if (responseData && Array.isArray(responseData.data)) {
        const ticketIds = responseData.data.map((t: any) => t.id || t.status).filter(Boolean);
        console.log(`EXPO TICKET IDS: [${ticketIds.join(', ')}]`);

        const invalidTokens: string[] = [];
        responseData.data.forEach((ticket: any, index: number) => {
          if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
            const badToken = validTokens[index];
            if (badToken) invalidTokens.push(badToken);
          }
        });

        if (invalidTokens.length > 0) {
          console.log('[NotificationService] Pruning invalid/unregistered Expo push tokens from DB:', invalidTokens);
          await User.updateMany(
            { $or: [{ pushToken: { $in: invalidTokens } }, { pushTokens: { $in: invalidTokens } }] },
            {
              $pull: { pushTokens: { $in: invalidTokens } } as any,
            }
          );
        }
      }
    } catch (err) {
      // Log Expo push failure without interrupting callers
      console.error('[NotificationService] Expo Push API request error (isolated):', err);
    }
  }
}

export const sendNotificationToUser = NotificationService.sendEventNotification.bind(NotificationService);
export const getProjectInvolvedUserIds = NotificationService.getProjectInvolvedUserIds.bind(NotificationService);
