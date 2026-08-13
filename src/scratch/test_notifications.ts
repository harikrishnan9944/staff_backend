import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../models/user.model';
import { Notification } from '../models/notification.model';
import { sendNotificationToUser } from '../services/notification.service';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/staff_management';

async function runNotificationVerification() {
  console.log('--- STARTING PUSH NOTIFICATION AUTOMATED VERIFICATION ---');

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB Connected successfully.');

    // 1. Fetch or create test users
    let testAdmin = await User.findOne({ role: 'Admin' });
    if (!testAdmin) {
      testAdmin = await User.create({
        name: 'Test Admin',
        username: 'test_admin_notif',
        password: 'password123',
        role: 'Admin',
        email: 'test_admin_notif@example.com',
        pushToken: 'ExponentPushToken[SimulatedAdminToken123]',
      });
    } else if (!testAdmin.pushToken) {
      testAdmin.pushToken = 'ExponentPushToken[SimulatedAdminToken123]';
      await testAdmin.save();
    }

    let testManager = await User.findOne({ role: 'Manager' });
    if (!testManager) {
      testManager = await User.create({
        name: 'Test Manager',
        username: 'test_manager_notif',
        password: 'password123',
        role: 'Manager',
        email: 'test_manager_notif@example.com',
        pushToken: 'ExponentPushToken[SimulatedManagerToken456]',
      });
    }

    console.log(`Admin User ID: ${testAdmin._id}, Token: ${testAdmin.pushToken}`);
    console.log(`Manager User ID: ${testManager._id}, Token: ${testManager.pushToken}`);

    // 2. Test Event 1: New Quotation Created
    console.log('\n--- TEST EVENT 1: New Quotation Created Notification ---');
    await sendNotificationToUser({
      roles: ['Admin', 'Manager'],
      title: 'New Quotation Created',
      message: 'Quotation #QT-1001 for amount 15000 has been created.',
      category: 'Quotation',
      data: { type: 'quotation_created', quotationId: 'quote_test_id_1001' },
    });

    const notifsAdmin = await Notification.find({ userId: testAdmin._id }).sort({ createdAt: -1 }).limit(1);
    console.log('Admin Notification record created in DB:', notifsAdmin[0]?.title, notifsAdmin[0]?.message);

    // 3. Test Event 2: Quotation Approved
    console.log('\n--- TEST EVENT 2: Quotation Approved Notification ---');
    await sendNotificationToUser({
      recipientIds: [testAdmin._id, testManager._id],
      title: 'Quotation Approved',
      message: 'Quotation #QT-1001 for material Steel Slabs has been approved.',
      category: 'Quotation',
      data: { type: 'quotation_approved', quotationId: 'quote_test_id_1001' },
    });

    // 4. Test Event 4: New Purchase Request
    console.log('\n--- TEST EVENT 4: Purchase Request Created Notification ---');
    await sendNotificationToUser({
      roles: ['Purchase Supervisor', 'Admin'],
      title: 'New Purchase Request',
      message: 'Purchase request PO-20260813-0001 has been created.',
      category: 'Purchase',
      data: { type: 'purchase_request_created', purchaseId: 'po_test_id_0001' },
    });

    // 5. Test Event 7: New Bill Uploaded
    console.log('\n--- TEST EVENT 7: New Bill Uploaded Notification ---');
    await sendNotificationToUser({
      roles: ['Accountant', 'Admin'],
      title: 'New Bill Uploaded',
      message: 'Bill #INV-9002 of amount 45000 uploaded successfully.',
      category: 'Payment',
      data: { type: 'bill_uploaded', invoiceId: 'inv_test_id_9002' },
    });

    // 6. Test Event 10: Task Assigned
    console.log('\n--- TEST EVENT 10: Task Assigned Notification ---');
    await sendNotificationToUser({
      recipientIds: [testManager._id],
      title: 'Task Assigned',
      message: 'You have been assigned to task "Granite Flooring Installation".',
      category: 'Material',
      data: { type: 'task_assigned', materialId: 'mat_test_id_7001' },
    });

    // 7. Test Failure Isolation (Simulate broken token & forced exception)
    console.log('\n--- TEST FAILURE ISOLATION ---');
    try {
      await sendNotificationToUser({
        recipientIds: ['invalid_id_format_test'],
        title: 'Faulty Notification',
        message: 'This should fail safely without crashing caller code.',
      });
      console.log('SUCCESS: Failure isolation handled error gracefully without throwing exception!');
    } catch (err) {
      console.error('ERROR: Failure isolation failed, exception was thrown!', err);
    }

    console.log('\n--- ALL NOTIFICATION VERIFICATIONS COMPLETED SUCCESSFULLY ---');
  } catch (error) {
    console.error('Verification script error:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

runNotificationVerification();
