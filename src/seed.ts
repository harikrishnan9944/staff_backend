import { connectDB } from './config/db';
import { User } from './models/user.model';
import { Project } from './models/project.model';
import { Material } from './models/material.model';
import { Purchase } from './models/purchase.model';
import { Invoice } from './models/invoice.model';
import { Vendor } from './models/vendor.model';
import { Payment } from './models/payment.model';
import { DocumentFile } from './models/document.model';
import { CompanySettings } from './models/settings.model';
import { ProjectMember } from './models/projectMember.model';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const seedDB = async () => {
  try {
    await connectDB();

    // 1. Clear existing documents
    console.log('Clearing existing collections for fresh seed...');
    await User.deleteMany({});
    await Project.deleteMany({});
    await Material.deleteMany({});
    await Purchase.deleteMany({});
    await Invoice.deleteMany({});
    await Vendor.deleteMany({});
    await Payment.deleteMany({});
    await DocumentFile.deleteMany({});
    await CompanySettings.deleteMany({});
    await ProjectMember.deleteMany({});
    console.log('Cleared existing collections successfully.');

    // 2. Seed Users
    console.log('Seeding users...');
    const adminUser = await User.create({
      name: 'Administrator',
      username: 'admin',
      password: 'password123',
      role: 'Admin',
      email: 'admin@construction.com',
      phone: '+15550000',
      profileImage: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=256&h=256&fit=crop',
      isActive: true,
      employeeId: 'EMP-0001',
      department: 'Administration & IT',
    });

    const architectUser = await User.create({
      name: 'Marcus Stone',
      username: 'architect',
      password: 'password123',
      role: 'Architect',
      email: 'marcus@construction.com',
      phone: '+15550211',
      profileImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=256&h=256&fit=crop',
      isActive: true,
      employeeId: 'EMP-0022',
      department: 'Design',
    });

    const opsHeadUser = await User.create({
      name: 'Sarah Connor',
      username: 'opshead',
      password: 'password123',
      role: 'Head of Operations',
      email: 'sarah@construction.com',
      phone: '+15550222',
      profileImage: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=256&h=256&fit=crop',
      isActive: true,
      employeeId: 'EMP-0033',
      department: 'Operations',
    });

    const managerUser = await User.create({
      name: 'Elena Rostova',
      username: 'manager',
      password: 'password123',
      role: 'Manager',
      email: 'elena@construction.com',
      phone: '+15550233',
      profileImage: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=256&h=256&fit=crop',
      isActive: true,
      employeeId: 'EMP-0044',
      department: 'Management',
    });

    const supervisorUser = await User.create({
      name: 'Jack Vance',
      username: 'supervisor',
      password: 'password123',
      role: 'Supervisor',
      email: 'jack@construction.com',
      phone: '+15550244',
      profileImage: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=256&h=256&fit=crop',
      isActive: true,
      employeeId: 'EMP-0055',
      department: 'Site Supervision',
    });

    const purchaserUser = await User.create({
      name: 'Bill Gates',
      username: 'purchaser',
      password: 'password123',
      role: 'Purchase Supervisor',
      email: 'bill@construction.com',
      phone: '+15550255',
      profileImage: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=256&h=256&fit=crop',
      isActive: true,
      employeeId: 'EMP-0066',
      department: 'Procurement',
    });

    const accountantUser = await User.create({
      name: 'Peter Parker',
      username: 'accountant',
      password: 'password123',
      role: 'Accountant',
      email: 'peter@construction.com',
      phone: '+15550266',
      profileImage: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?q=80&w=256&h=256&fit=crop',
      isActive: true,
      employeeId: 'EMP-0077',
      department: 'Finance',
    });

    console.log('Seeded standard users');

    // 3. Seed Company Settings
    console.log('Seeding company profile...');
    await CompanySettings.create({
      companyName: 'Nila Construction Group Ltd',
      companyLogo: 'uploads/logo.png',
      address: '128 Wacker Drive, Chicago, IL, USA',
      phone: '+1 555-0199',
      email: 'info@nilagroup.com',
      website: 'www.nilagroup.com',
      gstNumber: 'GST-US-202611A',
      panNumber: 'PAN-US-55443B',
      currency: 'USD',
      language: 'en',
      timezone: 'UTC-5',
      workingHours: '08:00 - 17:00',
      businessDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    });

    // 4. Seed Projects
    console.log('Seeding projects...');
    const project1 = await Project.create({
      name: 'Nila Villa Development',
      location: 'Sector 12, Chicago',
      progress: 45,
      stage: 'Foundation',
      status: 'Active',
      assignedUsers: [opsHeadUser._id, managerUser._id, purchaserUser._id, supervisorUser._id, architectUser._id, accountantUser._id],
      deletePassword: 'delete123',
    });

    const project2 = await Project.create({
      name: 'Westside Residences',
      location: 'Oak Avenue, Austin',
      progress: 85,
      stage: 'Finishing',
      status: 'Active',
      assignedUsers: [managerUser._id, supervisorUser._id, architectUser._id],
      deletePassword: 'delete123',
    });

    const project3 = await Project.create({
      name: 'Greenwood Apartments',
      location: 'Greenwood Road, Portland',
      progress: 20,
      stage: 'Foundation',
      status: 'Active',
      assignedUsers: [opsHeadUser._id, supervisorUser._id, architectUser._id],
      deletePassword: 'delete123',
    });

    const project4 = await Project.create({
      name: 'Skyline Heights',
      location: 'Summit Boulevard, Denver',
      progress: 65,
      stage: 'Framing',
      status: 'Active',
      assignedUsers: [managerUser._id, purchaserUser._id, accountantUser._id],
      deletePassword: 'delete123',
    });

    const project5 = await Project.create({
      name: 'Oceanfront Condos',
      location: 'Coastal Highway, Miami',
      progress: 10,
      stage: 'Planning',
      status: 'Planning',
      assignedUsers: [opsHeadUser._id, managerUser._id, supervisorUser._id],
      deletePassword: 'delete123',
    });

    console.log('Seeded projects');

    console.log('Seeding project members...');
    await ProjectMember.create([
      {
        projectId: project1._id,
        userId: opsHeadUser._id,
        role: 'Operation Head',
      },
      {
        projectId: project1._id,
        userId: managerUser._id,
        role: 'Project Manager',
      },
      {
        projectId: project1._id,
        userId: purchaserUser._id,
        role: 'Purchaser',
      },
      {
        projectId: project1._id,
        userId: supervisorUser._id,
        role: 'Supervisor',
      },
      {
        projectId: project1._id,
        userId: architectUser._id,
        role: 'Architect',
      },
      {
        projectId: project1._id,
        userId: accountantUser._id,
        role: 'Accountant',
      },
      {
        projectId: project2._id,
        userId: managerUser._id,
        role: 'Project Manager',
      },
      {
        projectId: project2._id,
        userId: supervisorUser._id,
        role: 'Supervisor',
      },
      {
        projectId: project2._id,
        userId: architectUser._id,
        role: 'Architect',
      },
      {
        projectId: project3._id,
        userId: opsHeadUser._id,
        role: 'Operation Head',
      },
      {
        projectId: project3._id,
        userId: supervisorUser._id,
        role: 'Supervisor',
      },
      {
        projectId: project3._id,
        userId: architectUser._id,
        role: 'Architect',
      },
      {
        projectId: project4._id,
        userId: managerUser._id,
        role: 'Project Manager',
      },
      {
        projectId: project4._id,
        userId: purchaserUser._id,
        role: 'Purchaser',
      },
      {
        projectId: project4._id,
        userId: accountantUser._id,
        role: 'Accountant',
      },
      {
        projectId: project5._id,
        userId: opsHeadUser._id,
        role: 'Operation Head',
      },
      {
        projectId: project5._id,
        userId: managerUser._id,
        role: 'Project Manager',
      },
      {
        projectId: project5._id,
        userId: supervisorUser._id,
        role: 'Supervisor',
      },
    ]);

    // 5. Seed Materials
    console.log('Seeding materials...');
    const materialGranite = await Material.create({
      projectId: project1._id,
      materialName: 'Black Galaxy Granite Slab',
      brand: 'Italian Marble Co',
      description: 'Double polished black galaxy granite, 18mm thickness.',
      quantity: 120,
      unit: 'sqft',
      estimatedCost: 15,
      priority: 'High',
      status: 'Purchase Completed',
      assignedUser: architectUser._id,
      remarks: 'Architect selected galaxy pattern.',
      createdBy: managerUser._id,
    });

    const materialCables = await Material.create({
      projectId: project1._id,
      materialName: '2.5 Sqmm Copper Cabling Roll',
      brand: 'Finolex FR',
      description: 'Fire resistant copper wires, 90 meter rolls.',
      quantity: 15,
      unit: 'rolls',
      estimatedCost: 45,
      priority: 'High',
      status: 'Bill Uploaded',
      assignedUser: supervisorUser._id,
      remarks: 'Delivered and verified by accountant.',
      createdBy: managerUser._id,
    });

    console.log('Seeded materials');

    // 6. Seed Vendors
    console.log('Seeding vendors...');
    const vendorMarble = await Vendor.create({
      name: 'Italian Marble Co Ltd',
      category: 'Masonry',
      address: '32 Industrial Area, Chicago',
      phone: '+1 555-0876',
      email: 'sales@italianmarble.com',
      gstNumber: 'GST-US-998822X',
      panNumber: 'PAN-US-112233Y',
      bankDetails: {
        bankName: 'Chase Bank',
        accountName: 'Italian Marble Co Ltd',
        accountNumber: '112233445566',
        ifscCode: 'CHASUS33',
      },
      primaryContact: 'Giovanni Rossi',
      rating: 5,
      purchaseCount: 1,
      totalPurchaseAmount: 2024,
      status: 'Active',
      profileImage: 'https://images.unsplash.com/photo-1560179707-f14e90ef3623?q=80&w=256&h=256',
      remarks: 'Top quality marble importer.',
      createdBy: managerUser._id,
    });

    console.log('Seeded vendors');

    // 7. Seed Purchases
    console.log('Seeding purchase orders...');
    const purchaseOrder = await Purchase.create({
      purchaseOrderNumber: 'PO-20260711-0001',
      projectId: project1._id,
      materialId: materialGranite._id,
      vendorId: vendorMarble._id,
      purchaseAmount: 1800,
      gst: 324,
      discount: 100,
      finalAmount: 2024,
      purchaseDate: new Date(),
      expectedDeliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      deliveryStatus: 'Pending',
      paymentStatus: 'Pending',
      status: 'Approved',
      remarks: 'Approved by Operations Head.',
      createdBy: purchaserUser._id,
    });

    console.log('Seeded purchase orders');

    // 8. Seed Payments
    console.log('Seeding payments...');
    const payment = await Payment.create({
      projectId: project1._id,
      purchaseId: purchaseOrder._id,
      vendorId: vendorMarble._id,
      amount: 1000,
      paymentType: 'Bank Transfer',
      transactionNumber: 'TXN-998877665544',
      status: 'Completed',
      paymentDate: new Date(),
      notes: 'Initial deposit of 50% released.',
      createdBy: accountantUser._id,
    });

    // Update PO payment status
    purchaseOrder.paymentStatus = 'Partially Paid';
    await purchaseOrder.save();

    console.log('Seeded payments');

    // 9. Seed Invoices
    console.log('Seeding invoices...');
    const invoice = await Invoice.create({
      invoiceNumber: 'INV-2026-909',
      purchaseId: purchaseOrder._id,
      projectId: project1._id,
      materialId: materialGranite._id,
      vendorId: vendorMarble._id,
      invoiceDate: new Date(),
      invoiceAmount: 1800,
      gstAmount: 324,
      totalAmount: 2124,
      invoiceFiles: ['https://images.unsplash.com/photo-1450133064473-71024230f91b?q=80&w=600'],
      verificationStatus: 'Pending',
      remarks: 'Invoice uploaded. Pending accountant audit.',
      uploadedBy: purchaserUser._id,
    });

    console.log('Seeded invoices');

    // 10. Seed Documents explorer
    console.log('Seeding documents...');
    await DocumentFile.create([
      {
        name: 'Villa Foundation Blueprints.pdf',
        fileUrl: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?q=80&w=600',
        fileType: 'PDF',
        fileSize: 4210900, // 4.2 MB
        folder: 'Project',
        projectId: project1._id,
        version: 1,
        uploadedBy: architectUser._id,
      },
      {
        name: 'Italian Marble Invoice.jpg',
        fileUrl: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?q=80&w=600',
        fileType: 'Image',
        fileSize: 1540200,
        folder: 'Invoice',
        projectId: project1._id,
        invoiceId: invoice._id,
        version: 1,
        uploadedBy: purchaserUser._id,
      },
    ]);

    console.log('Database seeding successfully completed with simplified records!');
  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
};

seedDB();
