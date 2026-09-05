import { connectDB } from '../config/db';
import { User } from '../models/user.model';
import { Project } from '../models/project.model';
import { Material } from '../models/material.model';
import { Purchase } from '../models/purchase.model';
import { Quotation } from '../models/quotation.model';
import { Invoice } from '../models/invoice.model';
import { Vendor } from '../models/vendor.model';
import { Payment } from '../models/payment.model';
import { DocumentFile } from '../models/document.model';
import { CompanySettings } from '../models/settings.model';
import { ProjectMember } from '../models/projectMember.model';
import { Notification } from '../models/notification.model';
import { PushSubscription } from '../models/pushSubscription.model';
import { MaterialWorkflow } from '../models/workflow.model';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const clearAndResetNewDB = async () => {
  try {
    console.log('Connecting to NEW MongoDB Database...');
    await connectDB();

    console.log('Wiping out all old data from NEW MongoDB cluster...');

    await Promise.all([
      User.deleteMany({}),
      Project.deleteMany({}),
      Material.deleteMany({}),
      Purchase.deleteMany({}),
      Quotation.deleteMany({}),
      Invoice.deleteMany({}),
      Vendor.deleteMany({}),
      Payment.deleteMany({}),
      DocumentFile.deleteMany({}),
      CompanySettings.deleteMany({}),
      ProjectMember.deleteMany({}),
      Notification.deleteMany({}),
      PushSubscription.deleteMany({}),
      MaterialWorkflow.deleteMany({}),
    ]);

    console.log('ALL OLD DATA REMOVED SUCCESSFULLY! Database is now 100% CLEAN.');

    // Create 1 fresh default Admin account so the user can login
    console.log('Creating fresh default Admin account...');
    const admin = await User.create({
      name: 'Administrator',
      username: 'admin',
      password: 'password123',
      role: 'Admin',
      email: 'admin@staffmanagement.com',
      phone: '+15550000',
      isActive: true,
      employeeId: 'EMP-0001',
      department: 'Administration',
    });

    console.log(`Fresh Admin Created -> Username: admin | Password: password123`);

  } catch (error) {
    console.error('Error clearing database:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
    process.exit(0);
  }
};

clearAndResetNewDB();
