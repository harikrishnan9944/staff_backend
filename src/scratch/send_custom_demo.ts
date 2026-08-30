import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { sendNotificationToUser } from '../services/notification.service';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || '';

async function sendCustomDemo() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB Connected successfully.');

    console.log('\nDispatching custom demo notification...');
    await sendNotificationToUser({
      roles: ['Admin', 'Manager', 'Staff', 'Head of Operations'],
      title: '🔔 Live Web Push Notification Test!',
      message: 'Nanba! Entha notification unga screen & browser-la vadhurukku pparunga! 🔥',
      category: 'System',
      priority: 'Critical',
      data: {
        type: 'live_demo',
        url: '/materials',
        timestamp: new Date().toISOString(),
      },
    });

    console.log('\nDemo notification sent successfully!');
  } catch (err) {
    console.error('Error during demo notification:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

sendCustomDemo();
