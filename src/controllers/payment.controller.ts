import { Response } from 'express';
import { Payment } from '../models/payment.model';
import { Purchase } from '../models/purchase.model';
import { Activity } from '../models/activity.model';
import { AuthRequest } from '../middlewares/auth.middleware';
import { sendNotificationToUser } from '../services/notification.service';

// Helper to recalculate and sync linked Purchase Order payment status
const syncPurchasePaymentStatus = async (purchaseId: string): Promise<void> => {
  const purchase = await Purchase.findById(purchaseId);
  if (!purchase) return;

  const payments = await Payment.find({ purchaseId, status: 'Completed' });
  const totalPaid = payments.reduce((acc, pay) => acc + pay.amount, 0);

  if (totalPaid >= purchase.finalAmount) {
    purchase.paymentStatus = 'Paid';
  } else if (totalPaid > 0) {
    purchase.paymentStatus = 'Partially Paid';
  } else {
    purchase.paymentStatus = 'Pending';
  }

  await purchase.save();
};

// GET /api/payments
// Authenticated user - Retrieve payments with search and filters
export const getPayments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, project, vendor, type, sort } = req.query;

    const query: any = {};

    if (project && project !== 'All') query.projectId = project;
    if (vendor && vendor !== 'All') query.vendorId = vendor;
    if (type && type !== 'All') query.paymentType = type;

    if (search) {
      const searchRegex = new RegExp(String(search), 'i');
      query.$or = [
        { transactionNumber: searchRegex },
        { chequeNumber: searchRegex },
      ];
    }

    let sortOption: any = { paymentDate: -1 };
    if (sort === 'Oldest') {
      sortOption = { paymentDate: 1 };
    } else if (sort === 'Highest Amount') {
      sortOption = { amount: -1 };
    } else if (sort === 'Lowest Amount') {
      sortOption = { amount: 1 };
    }

    const payments = await Payment.find(query)
      .populate('projectId', 'name')
      .populate('purchaseId', 'purchaseOrderNumber finalAmount')
      .populate('vendorId', 'name')
      .populate('createdBy', 'name username')
      .sort(sortOption);

    res.status(200).json({
      success: true,
      count: payments.length,
      payments,
    });
  } catch (error) {
    console.error('getPayments error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/payments/:id
// Authenticated user - Retrieve payment details
export const getPaymentById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const payment = await Payment.findById(id)
      .populate('projectId', 'name location')
      .populate('purchaseId', 'purchaseOrderNumber finalAmount')
      .populate('vendorId', 'name bankDetails address')
      .populate('createdBy', 'name username role');

    if (!payment) {
      res.status(404).json({ success: false, message: 'Payment record not found' });
      return;
    }

    res.status(200).json({
      success: true,
      payment,
    });
  } catch (error) {
    console.error('getPaymentById error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/payments
// Accountant & Admin only - Create/Disburse a Payment
export const createPayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      purchaseId,
      amount,
      paymentType,
      transactionNumber,
      chequeNumber,
      notes,
    } = req.body;
    const user = req.user;

    if (!purchaseId || amount === undefined || !paymentType) {
      res.status(400).json({ success: false, message: 'Required fields are missing' });
      return;
    }

    // Verify PO exists
    const purchase = await Purchase.findById(purchaseId);
    if (!purchase) {
      res.status(404).json({ success: false, message: 'Purchase Order not found' });
      return;
    }

    const payment = await Payment.create({
      projectId: purchase.projectId,
      purchaseId,
      vendorId: purchase.vendorId,
      amount,
      paymentType,
      transactionNumber,
      chequeNumber,
      status: 'Completed',
      paymentDate: new Date(),
      notes,
      createdBy: user?._id,
    });

    // Recalculate purchase order payment states
    await syncPurchasePaymentStatus(purchaseId);

    // Create log
    await Activity.create({
      user: user?._id,
      action: `Disbursed payment of $${amount} via ${paymentType} for PO '${purchase.purchaseOrderNumber}'`,
      project: purchase.projectId,
    });

    res.status(201).json({
      success: true,
      message: 'Payment completed successfully',
      payment,
    });
  } catch (error) {
    console.error('createPayment error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PUT /api/payments/:id
// Accountant & Admin only - Edit payment record
export const updatePayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { amount, paymentType, transactionNumber, chequeNumber, status, notes } = req.body;
    const user = req.user;

    const payment = await Payment.findById(id);
    if (!payment) {
      res.status(404).json({ success: false, message: 'Payment record not found' });
      return;
    }

    if (amount !== undefined) payment.amount = amount;
    if (paymentType) payment.paymentType = paymentType;
    if (transactionNumber !== undefined) payment.transactionNumber = transactionNumber;
    if (chequeNumber !== undefined) payment.chequeNumber = chequeNumber;
    if (status) payment.status = status;
    if (notes !== undefined) payment.notes = notes;

    await payment.save();

    // Recalculate payment status on the purchase order
    await syncPurchasePaymentStatus(payment.purchaseId.toString());

    await Activity.create({
      user: user?._id,
      action: `Modified payment transaction references for Payment ID: ${payment._id}`,
      project: payment.projectId,
    });

    res.status(200).json({
      success: true,
      message: 'Payment record updated successfully',
      payment,
    });
  } catch (error) {
    console.error('updatePayment error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// DELETE /api/payments/:id
// Admin only - Revoke payment
export const deletePayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const payment = await Payment.findById(id);
    if (!payment) {
      res.status(404).json({ success: false, message: 'Payment record not found' });
      return;
    }

    const purchaseId = payment.purchaseId.toString();

    await Payment.findByIdAndDelete(id);

    // Sync PO paymentStatus back
    await syncPurchasePaymentStatus(purchaseId);

    await Activity.create({
      user: req.user?._id,
      action: `Revoked/Deleted payment record of $${payment.amount} for PO`,
      project: payment.projectId,
    });

    res.status(200).json({
      success: true,
      message: 'Payment transaction revoked successfully',
    });
  } catch (error) {
    console.error('deletePayment error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
