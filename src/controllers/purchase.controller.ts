import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Purchase } from '../models/purchase.model';
import { Activity } from '../models/activity.model';
import { MaterialWorkflow } from '../models/workflow.model';
import { Material } from '../models/material.model';
import { AuthRequest } from '../middlewares/auth.middleware';

// Helper to generate a collision-proof unique PO number: PO-YYYYMMDD-XXXX
const generatePONumber = async (): Promise<string> => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  const count = await Purchase.countDocuments();
  let suffixNum = count + 1;
  let candidate = `PO-${dateStr}-${String(suffixNum).padStart(4, '0')}`;

  // Loop to guarantee absolute uniqueness and avoid E11000 duplicate key error
  while (await Purchase.findOne({ purchaseOrderNumber: candidate })) {
    suffixNum++;
    candidate = `PO-${dateStr}-${String(suffixNum).padStart(4, '0')}`;
  }

  return candidate;
};

// GET /api/purchases
// Authenticated user - Retrieve purchases with search, filter, and sort
export const getPurchases = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, status, vendor, project, materialId, sort } = req.query;

    const query: any = {};

    // 1. Search Query (PO Number, Project Name, Material Name, Vendor Name)
    if (search) {
      const searchRegex = new RegExp(String(search), 'i');
      query.$or = [
        { purchaseOrderNumber: searchRegex },
      ];
    }

    // 2. Filters
    if (status && status !== 'All') {
      query.status = status;
    }
    if (vendor && vendor !== 'All' && vendor !== 'undefined' && vendor !== 'null') {
      query.vendorId = vendor;
    }
    if (project && project !== 'All' && project !== 'undefined' && project !== 'null') {
      query.projectId = project;
    }
    if (materialId && materialId !== 'undefined' && materialId !== 'null') {
      query.materialId = materialId;
    }

    // 3. Sorting
    let sortOption: any = { createdAt: -1 };
    if (sort === 'Oldest') {
      sortOption = { createdAt: 1 };
    } else if (sort === 'Highest Amount') {
      sortOption = { finalAmount: -1 };
    } else if (sort === 'Lowest Amount') {
      sortOption = { finalAmount: 1 };
    }

    const purchases = await Purchase.find(query)
      .populate('projectId', 'name')
      .populate('categoryId', 'name color')
      .populate('materialId', 'materialName brand unit materialImage')
      .populate('vendorId', 'name username')
      .populate('createdBy', 'name username')
      .sort(sortOption);

    res.status(200).json({
      success: true,
      count: purchases.length,
      purchases,
    });
  } catch (error) {
    console.error('getPurchases error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/purchases/:id
// Authenticated user - Retrieve a purchase order detail
export const getPurchaseById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const purchase = await Purchase.findById(id)
      .populate('projectId', 'name location')
      .populate('categoryId', 'name color')
      .populate('materialId', 'materialName brand description quantity unit estimatedCost materialImage')
      .populate('vendorId', 'name username email phone profileImage')
      .populate('createdBy', 'name username');

    if (!purchase) {
      res.status(404).json({ success: false, message: 'Purchase order not found' });
      return;
    }

    res.status(200).json({
      success: true,
      purchase,
    });
  } catch (error) {
    console.error('getPurchaseById error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/purchases
// Purchase Supervisor & Admin only - Create a purchase order
export const createPurchase = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      projectId,
      categoryId,
      materialId,
      quotationId,
      vendorId,
      vendorName,
      purchaseAmount,
      gst,
      discount,
      transactionFees,
      purchaseDate,
      expectedDeliveryDate,
      remarks,
      attachments,
    } = req.body;
    const user = req.user;

    if (!projectId || !materialId || purchaseAmount === undefined) {
      res.status(400).json({ success: false, message: 'Required fields are missing' });
      return;
    }

    const computedGST = gst || 0;
    const computedDiscount = discount || 0;
    const computedFees = transactionFees || 0;
    const finalAmount = Number(purchaseAmount) + Number(computedGST) - Number(computedDiscount) + Number(computedFees);

    // Auto generate PO number
    const purchaseOrderNumber = await generatePONumber();

    const validCategoryId = (categoryId && categoryId !== 'undefined' && categoryId !== 'null' && categoryId !== '') ? categoryId : undefined;
    const validVendorId = (vendorId && vendorId !== 'undefined' && vendorId !== 'null' && vendorId !== '') ? vendorId : undefined;
    const creatorId = user?._id || new mongoose.Types.ObjectId();

    const purchase = await Purchase.create({
      purchaseOrderNumber,
      projectId,
      categoryId: validCategoryId,
      materialId,
      quotationId: quotationId || undefined,
      vendorId: validVendorId,
      vendorName: vendorName || '',
      purchaseAmount,
      gst: computedGST,
      discount: computedDiscount,
      transactionFees: computedFees,
      finalAmount,
      purchaseDate: purchaseDate || new Date(),
      expectedDeliveryDate: expectedDeliveryDate || new Date(),
      deliveryStatus: 'Pending',
      paymentStatus: 'Pending',
      status: 'Draft',
      attachments: attachments || [],
      remarks: remarks || '',
      createdBy: creatorId,
    });

    // Create activity logs
    await Activity.create({
      user: user?._id,
      action: `Created Purchase Order '${purchaseOrderNumber}'`,
      project: projectId,
    });

    // Automatically transition material workflow status to "Waiting for Purchase"
    await MaterialWorkflow.findOneAndUpdate(
      { materialId },
      { status: 'Waiting for Purchase', currentStage: 'Purchase' }
    );

    // Transition Material status to 'Purchase Completed'
    await Material.findByIdAndUpdate(materialId, { status: 'Purchase Completed' });

    const populatedPurchase = await Purchase.findById(purchase._id)
      .populate('projectId', 'name')
      .populate('materialId', 'materialName materialImage')
      .populate('vendorId', 'name');

    res.status(201).json({
      success: true,
      message: `Purchase Order '${purchaseOrderNumber}' created successfully as Draft`,
      purchase: populatedPurchase,
    });
  } catch (error: any) {
    console.error('createPurchase error:', error);
    res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
  }
};

// PUT /api/purchases/:id
// Admin & Purchase Supervisor only - Edit PO
export const updatePurchase = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      vendorId,
      vendorName,
      purchaseAmount,
      gst,
      discount,
      transactionFees,
      purchaseDate,
      expectedDeliveryDate,
      remarks,
      attachments,
    } = req.body;
    const user = req.user;

    const purchase = await Purchase.findById(id);
    if (!purchase) {
      res.status(404).json({ success: false, message: 'Purchase order not found' });
      return;
    }

    if (purchase.status === 'Completed' || purchase.status === 'Cancelled') {
      res.status(400).json({
        success: false,
        message: `Forbidden: Cannot modify a purchase order that is already ${purchase.status}`,
      });
      return;
    }

    if (vendorId) purchase.vendorId = vendorId;
    if (vendorName !== undefined) purchase.vendorName = vendorName;
    if (purchaseAmount !== undefined) purchase.purchaseAmount = purchaseAmount;
    if (gst !== undefined) purchase.gst = gst;
    if (discount !== undefined) purchase.discount = discount;
    if (transactionFees !== undefined) purchase.transactionFees = transactionFees;
    if (purchaseDate) {
      purchase.purchaseDate = purchaseDate;
      purchase.expectedDeliveryDate = purchaseDate;
    } else if (expectedDeliveryDate) {
      purchase.expectedDeliveryDate = expectedDeliveryDate;
    }
    if (remarks !== undefined) purchase.remarks = remarks;
    if (attachments !== undefined) purchase.attachments = attachments;

    // Recompute final amount
    purchase.finalAmount = Number(purchase.purchaseAmount) + Number(purchase.gst) - Number(purchase.discount) + Number(purchase.transactionFees || 0);

    await purchase.save();

    await Activity.create({
      user: user?._id,
      action: `Modified Purchase Order details for '${purchase.purchaseOrderNumber}'`,
      project: purchase.projectId,
    });

    const populatedPurchase = await Purchase.findById(id)
      .populate('projectId', 'name')
      .populate('vendorId', 'name')
      .populate('materialId', 'materialName materialImage');

    res.status(200).json({
      success: true,
      message: 'Purchase Order details updated successfully',
      purchase: populatedPurchase,
    });
  } catch (error) {
    console.error('updatePurchase error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// DELETE /api/purchases/:id
// Admin only - Remove a draft or cancelled purchase
export const deletePurchase = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const purchase = await Purchase.findById(id);
    if (!purchase) {
      res.status(404).json({ success: false, message: 'Purchase order not found' });
      return;
    }

    // Allow deleting any purchase order in simple CRUD mode

    await Purchase.findByIdAndDelete(id);

    await Activity.create({
      user: req.user?._id,
      action: `Deleted Purchase Order '${purchase.purchaseOrderNumber}'`,
      project: purchase.projectId,
    });

    res.status(200).json({
      success: true,
      message: `Purchase Order '${purchase.purchaseOrderNumber}' deleted successfully`,
    });
  } catch (error) {
    console.error('deletePurchase error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PATCH /api/purchases/status
// Authenticated user - State transitions (Approvals, Cancellations, Payments)
export const updateStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { purchaseId, status, paymentStatus, remarks } = req.body;
    const user = req.user;

    if (!user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    if (!purchaseId) {
      res.status(400).json({ success: false, message: 'purchaseId is required' });
      return;
    }

    const purchase = await Purchase.findById(purchaseId);
    if (!purchase) {
      res.status(404).json({ success: false, message: 'Purchase order not found' });
      return;
    }

    const role = user.role;
    let allowed = false;
    let actionLog = '';

    // 1. PO State Transitions Guards
    if (status && status !== purchase.status) {
      if (role === 'Admin' || role === 'Head of Operations' || role === 'Manager') {
        allowed = true;
      } 
      else if (role === 'Purchase Supervisor' && status === 'Ordered' && purchase.status === 'Draft') {
        allowed = true; // Purchase Supervisor can change Draft to Ordered
      } 
      else if (role === 'Purchase Supervisor' && status === 'Completed' && purchase.status === 'Delivered') {
        allowed = true; // Completed once delivered
      } 
      else if (status === 'Cancelled' && ['Draft', 'Ordered'].includes(purchase.status)) {
        // Purchase Supervisor can cancel pending orders (Manager/Admin/Ops Head are already allowed above)
        if (role === 'Purchase Supervisor') {
          allowed = true;
        }
      }

      if (allowed) {
        purchase.status = status;
        actionLog = `Transitioned PO status to '${status}'`;

        // If approved, trigger workflow update
        if (status === 'Approved') {
          await MaterialWorkflow.findOneAndUpdate(
            { materialId: purchase.materialId },
            { status: 'Purchased', progress: 70 }
          );
        }
        // If completed, trigger workflow completion
        if (status === 'Completed') {
          await MaterialWorkflow.findOneAndUpdate(
            { materialId: purchase.materialId },
            { status: 'Completed', currentStage: 'Completed', progress: 100 }
          );
        }
      } else {
        res.status(403).json({
          success: false,
          message: `Access Denied: Role '${role}' is not authorized to change PO status to '${status}'`,
        });
        return;
      }
    }

    // 2. Accountant Payment Status Updates
    if (paymentStatus && paymentStatus !== purchase.paymentStatus) {
      if (role === 'Accountant' || role === 'Admin' || role === 'Head of Operations' || role === 'Manager') {
        purchase.paymentStatus = paymentStatus;
        actionLog = (actionLog ? actionLog + ', ' : '') + `Updated Payment Status to '${paymentStatus}'`;
        
        // If paid, we also set the purchase status to Completed (if delivered)
        if (paymentStatus === 'Paid' && purchase.status === 'Delivered') {
          purchase.status = 'Completed';
          await MaterialWorkflow.findOneAndUpdate(
            { materialId: purchase.materialId },
            { status: 'Completed', currentStage: 'Completed', progress: 100 }
          );
        }
      } else {
        res.status(403).json({
          success: false,
          message: 'Only Accountants or Admins can modify payment statuses',
        });
        return;
      }
    }

    if (actionLog) {
      if (remarks) purchase.remarks = remarks;
      await purchase.save();

      // Log activity
      await Activity.create({
        user: user._id,
        action: `${actionLog} for PO '${purchase.purchaseOrderNumber}'`,
        project: purchase.projectId,
      });

      res.status(200).json({
        success: true,
        message: 'Status updated successfully',
        purchase,
      });
    } else {
      res.status(400).json({ success: false, message: 'No valid status transition parameters provided' });
    }
  } catch (error) {
    console.error('updateStatus error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PATCH /api/purchases/delivery
// Authenticated user - Update delivery tracking milestones
export const updateDelivery = async (req: Request, res: Response): Promise<void> => {
  try {
    const { purchaseId, deliveryStatus, remarks } = req.body;
    const user = (req as any).user; // Auth request user

    if (!purchaseId || !deliveryStatus) {
      res.status(400).json({ success: false, message: 'purchaseId and deliveryStatus are required' });
      return;
    }

    // Role check: Purchase Supervisor or Admin only
    if (user.role !== 'Purchase Supervisor' && user.role !== 'Admin') {
      res.status(403).json({ success: false, message: 'Only Purchase Supervisors or Admins can update delivery statuses' });
      return;
    }

    const purchase = await Purchase.findById(purchaseId);
    if (!purchase) {
      res.status(404).json({ success: false, message: 'Purchase order not found' });
      return;
    }

    const oldDeliveryStatus = purchase.deliveryStatus;
    purchase.deliveryStatus = deliveryStatus;

    if (deliveryStatus === 'Delivered') {
      purchase.actualDeliveryDate = new Date();
      purchase.status = 'Delivered';

      // Automatically sync material workflow to "Invoice Uploaded"
      await MaterialWorkflow.findOneAndUpdate(
        { materialId: purchase.materialId },
        { status: 'Invoice Uploaded', currentStage: 'Invoice Upload', progress: 85 }
      );
    }

    if (remarks) purchase.remarks = remarks;
    await purchase.save();

    // Log activity
    await Activity.create({
      user: user._id,
      action: `Updated delivery status of PO '${purchase.purchaseOrderNumber}' to '${deliveryStatus}'`,
      project: purchase.projectId,
    });

    res.status(200).json({
      success: true,
      message: `Delivery status updated to ${deliveryStatus} successfully`,
      purchase,
    });
  } catch (error) {
    console.error('updateDelivery error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
