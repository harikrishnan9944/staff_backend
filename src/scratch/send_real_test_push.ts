import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../models/user.model';
import { sendNotificationToUser } from '../services/notification.service';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || '';

async function testPush() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB Connected successfully.');

    const users = await User.find({ pushToken: { $regex: /^ExponentPushToken/ } });
    console.log(`Found ${users.length} users with Expo Push Tokens:`);
    users.forEach((u) => console.log(` - ${u.username} (${u.name}): ${u.pushToken}`));

    if (users.length === 0) {
      console.log('No users found with Expo push tokens.');
      return;
    }

    console.log('\nSending test push notification via NotificationService...');
    await sendNotificationToUser({
      roles: ['Admin', 'Manager', 'Staff', 'Head of Operations'],
      title: '🔔 Test Notification',
      message: 'Nanba, entha notification ungaluku vanthurucha pparunga!',
      category: 'System',
      data: { test: true },
    });

    console.log('\nFinished dispatching test notification.');
  } catch (err) {
    console.error('Error during test push:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

testPush();
