import { Response } from 'express';
import { Invoice } from '../models/invoice.model';
import { Purchase } from '../models/purchase.model';
import { MaterialWorkflow } from '../models/workflow.model';
import { Activity } from '../models/activity.model';
import { Material } from '../models/material.model';
import { AuthRequest } from '../middlewares/auth.middleware';
import { uploadToCloudinary } from '../config/cloudinary';
import { sendNotificationToUser } from '../services/notification.service';

// GET /api/invoices
// Authenticated user - Retrieve list of invoices with search, filter, and sort
export const getInvoices = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, status, project, vendor, sort } = req.query;

    const query: any = {};

    // 1. Search Query (Invoice Number)
    if (search) {
      query.invoiceNumber = new RegExp(String(search), 'i');
    }

    // 2. Filters
    if (status && status !== 'All') {
      query.verificationStatus = status;
    }
    if (project && project !== 'All') {
      query.projectId = project;
    }
    if (vendor && vendor !== 'All') {
      query.vendorId = vendor;
    }

    // 3. Sorting
    let sortOption: any = { createdAt: -1 };
    if (sort === 'Oldest') {
      sortOption = { createdAt: 1 };
    } else if (sort === 'Highest Amount') {
      sortOption = { totalAmount: -1 };
    } else if (sort === 'Lowest Amount') {
      sortOption = { totalAmount: 1 };
    }

    const invoices = await Invoice.find(query)
      .populate('projectId', 'name')
      .populate('categoryId', 'name color')
      .populate('materialId', 'materialName brand unit')
      .populate('purchaseId', 'purchaseOrderNumber finalAmount')
      .populate('vendorId', 'name username')
      .populate('uploadedBy', 'name username')
      .sort(sortOption);

    res.status(200).json({
      success: true,
      count: invoices.length,
      invoices,
    });
  } catch (error) {
    console.error('getInvoices error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/invoices/:id
// Authenticated user - Retrieve detailed invoice
export const getInvoiceById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const invoice = await Invoice.findById(id)
      .populate('projectId', 'name location')
      .populate('categoryId', 'name color')
      .populate('materialId', 'materialName brand unit estimatedCost')
      .populate('purchaseId', 'purchaseOrderNumber purchaseDate finalAmount paymentStatus status')
      .populate('vendorId', 'name username email phone profileImage')
      .populate('uploadedBy', 'name username role')
      .populate('verifiedBy', 'name username role');

    if (!invoice) {
      res.status(404).json({ success: false, message: 'Invoice not found' });
      return;
    }

    res.status(200).json({
      success: true,
      invoice,
    });
  } catch (error) {
    console.error('getInvoiceById error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/invoices
// Purchase Supervisor & Admin only - Upload / Create an Invoice
export const createInvoice = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      invoiceNumber,
      purchaseId,
      invoiceDate,
      invoiceAmount,
      gstAmount,
      remarks,
      files, // Array of base64 strings representing attachments
    } = req.body;
    const user = req.user;

    if (!invoiceNumber || !purchaseId || !invoiceDate || invoiceAmount === undefined || gstAmount === undefined) {
      res.status(400).json({ success: false, message: 'Required fields are missing' });
      return;
    }

    // Check unique invoice number
    const invoiceExists = await Invoice.findOne({ invoiceNumber });
    if (invoiceExists) {
      res.status(400).json({ success: false, message: `Invoice number '${invoiceNumber}' has already been registered` });
      return;
    }

    // Fetch related Purchase Order details
    const purchase = await Purchase.findById(purchaseId);
    if (!purchase) {
      res.status(404).json({ success: false, message: 'Purchase Order not found' });
      return;
    }

    // Upload files to Cloudinary (using base64 strings) if provided
    let invoiceUrls: string[] = [];
    if (files && files.length > 0) {
      console.log(`Uploading ${files.length} invoice files to Cloudinary...`);
      const uploadPromises = files.map((fileBase64: string) => uploadToCloudinary(fileBase64));
      invoiceUrls = await Promise.all(uploadPromises);
    }

    const totalAmount = Number(invoiceAmount) + Number(gstAmount);

    const invoice = await Invoice.create({
      invoiceNumber,
      purchaseId,
      projectId: purchase.projectId,
      categoryId: purchase.categoryId,
      materialId: purchase.materialId,
      vendorId: purchase.vendorId,
      invoiceDate,
      invoiceAmount,
      gstAmount,
      totalAmount,
      invoiceFiles: invoiceUrls,
      verificationStatus: 'Pending',
      remarks,
      uploadedBy: user?._id,
    });

    // Log Activity
    await Activity.create({
      user: user?._id,
      action: `Uploaded Invoice '${invoiceNumber}' for PO '${purchase.purchaseOrderNumber}'`,
      project: purchase.projectId,
    });

    // Update MaterialWorkflow to "Invoice Uploaded"
    await MaterialWorkflow.findOneAndUpdate(
      { materialId: purchase.materialId },
      { status: 'Invoice Uploaded', currentStage: 'Invoice Upload', progress: 85 }
    );

    // Transition Material status to 'Bill Uploaded' and set editor metrics
    await Material.findByIdAndUpdate(purchase.materialId, {
      status: 'Bill Uploaded',
      lastUpdatedBy: user?._id,
      lastUpdatedByRole: user?.role,
      lastUpdatedDate: new Date(),
    });

    const populatedInvoice = await Invoice.findById(invoice._id)
      .populate('projectId', 'name')
      .populate('purchaseId', 'purchaseOrderNumber');

    // AUTOMATIC NOTIFICATION: New bill uploaded
    await sendNotificationToUser({
      roles: ['Accountant', 'Admin', 'Manager'],
      title: 'New Bill Uploaded',
      message: `Invoice/Bill #${invoiceNumber} of amount ${totalAmount} has been uploaded.`,
      category: 'Payment',
      data: {
        type: 'bill_uploaded',
        invoiceId: invoice._id.toString(),
        invoiceNumber,
      },
      excludeUserId: user?._id,
    });

    res.status(201).json({
      success: true,
      message: `Invoice '${invoiceNumber}' uploaded successfully and submitted for Accountant audit`,
      invoice: populatedInvoice,
    });
  } catch (error) {
    console.error('createInvoice error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PUT /api/invoices/:id
// Purchase Supervisor & Admin only - Replace / Edit Invoice
export const updateInvoice = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { invoiceDate, invoiceAmount, gstAmount, remarks, files } = req.body;
    const user = req.user;

    const invoice = await Invoice.findById(id);
    if (!invoice) {
      res.status(404).json({ success: false, message: 'Invoice not found' });
      return;
    }

    if (invoice.verificationStatus === 'Verified') {
      res.status(400).json({ success: false, message: 'Verified invoices cannot be edited or replaced' });
      return;
    }

    if (invoiceDate) invoice.invoiceDate = invoiceDate;
    if (invoiceAmount !== undefined) invoice.invoiceAmount = invoiceAmount;
    if (gstAmount !== undefined) invoice.gstAmount = gstAmount;
    if (remarks !== undefined) invoice.remarks = remarks;

    // Replace files if new ones are provided
    if (files && files.length > 0) {
      console.log('Uploading replacement files to Cloudinary...');
      const uploadPromises = files.map((fileBase64: string) => uploadToCloudinary(fileBase64));
      invoice.invoiceFiles = await Promise.all(uploadPromises);
    }

    // Recompute total amount
    invoice.totalAmount = Number(invoice.invoiceAmount) + Number(invoice.gstAmount);
    
    // Reset verification back to Pending if it was rejected previously
    invoice.verificationStatus = 'Pending';

    await invoice.save();

    await Activity.create({
      user: user?._id,
      action: `Modified/Replaced Invoice details for '${invoice.invoiceNumber}'`,
      project: invoice.projectId,
    });

    // Re-verify MaterialWorkflow stage
    await MaterialWorkflow.findOneAndUpdate(
      { materialId: invoice.materialId },
      { status: 'Invoice Uploaded', progress: 85 }
    );

    const populatedInvoice = await Invoice.findById(id)
      .populate('projectId', 'name')
      .populate('purchaseId', 'purchaseOrderNumber');

    res.status(200).json({
      success: true,
      message: 'Invoice replaced/updated successfully',
      invoice: populatedInvoice,
    });
  } catch (error) {
    console.error('updateInvoice error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// DELETE /api/invoices/:id
// Admin only - Delete Invoice
export const deleteInvoice = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const invoice = await Invoice.findById(id);
    if (!invoice) {
      res.status(404).json({ success: false, message: 'Invoice not found' });
      return;
    }

    await Invoice.findByIdAndDelete(id);

    await Activity.create({
      user: req.user?._id,
      action: `Deleted Invoice '${invoice.invoiceNumber}'`,
      project: invoice.projectId,
    });

    res.status(200).json({
      success: true,
      message: `Invoice '${invoice.invoiceNumber}' deleted successfully`,
    });
  } catch (error) {
    console.error('deleteInvoice error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PATCH /api/invoices/verify
// Accountant & Admin only - Verify Invoice
export const verifyInvoice = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { invoiceId, verificationStatus, remarks } = req.body;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    if (!invoiceId || !verificationStatus) {
      res.status(400).json({ success: false, message: 'invoiceId and verificationStatus are required' });
      return;
    }

    // Role check: Accountant or Admin only
    if (user.role !== 'Accountant' && user.role !== 'Admin') {
      res.status(403).json({ success: false, message: 'Only Accountants or Admins can audit/verify invoices' });
      return;
    }

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) {
      res.status(404).json({ success: false, message: 'Invoice not found' });
      return;
    }

    invoice.verificationStatus = verificationStatus;
    invoice.verifiedBy = user._id;
    if (remarks) invoice.remarks = remarks;

    await invoice.save();

    // Log Activity
    await Activity.create({
      user: user._id,
      action: `Set Invoice '${invoice.invoiceNumber}' verification state to '${verificationStatus}'`,
      project: invoice.projectId,
    });

    // Synchronize MaterialWorkflow
    let workflowStatus: any = 'Invoice Uploaded';
    let workflowStage: any = 'Invoice Upload';
    let workflowProgress = 85;

    if (verificationStatus === 'Verified') {
      workflowStatus = 'Verified';
      workflowStage = 'Accounts Verification';
      workflowProgress = 95;
    } else if (verificationStatus === 'Rejected') {
      workflowStatus = 'Waiting for Purchase'; // Fallback stage to re-purchase or re-upload
      workflowStage = 'Purchase';
      workflowProgress = 55;
    } else if (verificationStatus === 'Need Clarification') {
      workflowStatus = 'Invoice Uploaded';
      workflowStage = 'Invoice Upload';
      workflowProgress = 80;
    }

    await MaterialWorkflow.findOneAndUpdate(
      { materialId: invoice.materialId },
      { status: workflowStatus, currentStage: workflowStage, progress: workflowProgress, remarks: `Invoice audit status: ${verificationStatus}. ${remarks || ''}` }
    );

    res.status(200).json({
      success: true,
      message: `Invoice verification status set to ${verificationStatus} successfully`,
      invoice,
    });
  } catch (error) {
    console.error('verifyInvoice error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
