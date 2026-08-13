import { Response } from 'express';
import mongoose from 'mongoose';
import { Material } from '../models/material.model';
import { Project } from '../models/project.model';
import { Activity } from '../models/activity.model';
import { Quotation } from '../models/quotation.model';
import { Purchase } from '../models/purchase.model';
import { Invoice } from '../models/invoice.model';
import { DocumentFile } from '../models/document.model';
import { MaterialWorkflow } from '../models/workflow.model';
import { Payment } from '../models/payment.model';
import { AuthRequest } from '../middlewares/auth.middleware';
import { sendNotificationToUser } from '../services/notification.service';

const syncMaterialRelatedRecords = async (material: any, userId: any) => {
  try {
    const status = material.status;
    const matId = material._id;

    // Sync workflow stage for all statuses
    let wfStatus = 'Material Selection';
    let wfStage = 'Selection';
    let wfProgress = 20;

    if (status === 'Registered') {
      wfStatus = 'Registered';
      wfStage = 'Register';
      wfProgress = 10;
    } else if (status === 'Material Selection') {
      wfStatus = 'Material Selection';
      wfStage = 'Selection';
      wfProgress = 20;
    } else if (['Material Approve', 'Sectioned'].includes(status)) {
      wfStatus = 'Sectioned';
      wfStage = 'Selection';
      wfProgress = 40;
    } else if (status === 'Quotation Set') {
      wfStatus = 'Quotation Selection';
      wfStage = 'Quotation';
      wfProgress = 50;
    } else if (status === 'Awaiting Approval') {
      wfStatus = 'Awaiting Approval';
      wfStage = 'Quotation';
      wfProgress = 55;
    } else if (['Quotation Approved', 'Purchase Completed', 'Bill Uploaded'].includes(status)) {
      wfStatus = 'Waiting for Purchase';
      wfStage = 'Purchase';
      wfProgress = 60;
    }

    await MaterialWorkflow.findOneAndUpdate(
      { materialId: matId },
      { status: wfStatus, currentStage: wfStage, progress: wfProgress },
      { upsert: true }
    );

    if (['Quotation Approved', 'Purchase Completed', 'Bill Uploaded'].includes(status)) {
      const existingQuote = await Quotation.findOne({ materialId: matId });
      if (!existingQuote) {
        await Quotation.create({
          materialId: matId,
          vendor: material.vendorName || 'Vendor',
          amount: material.estimatedCost || 0,
          transportCharges: material.transportCharges || 0,
          description: (material.description || material.remarks || 'Quotation record') + ' [Auto-Generated]',
          status: 'Approved',
        });
      } else {
        let changed = false;
        if (existingQuote.status !== 'Approved') {
          existingQuote.status = 'Approved';
          changed = true;
        }
        if (existingQuote.transportCharges !== material.transportCharges) {
          existingQuote.transportCharges = material.transportCharges || 0;
          changed = true;
        }
        if (changed) {
          await existingQuote.save();
        }
      }
    }

    const effectiveUserId = userId || material.createdBy || material.lastUpdatedBy;

    if (['Purchase Completed', 'Bill Uploaded'].includes(status)) {
      const existingPurchase = await Purchase.findOne({ materialId: matId });
      if (!existingPurchase) {
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const count = await Purchase.countDocuments();
        let suffixNum = count + 1;
        let purchaseOrderNumber = `PO-${dateStr}-${String(suffixNum).padStart(4, '0')}`;
        while (await Purchase.findOne({ purchaseOrderNumber })) {
          suffixNum++;
          purchaseOrderNumber = `PO-${dateStr}-${String(suffixNum).padStart(4, '0')}`;
        }

        await Purchase.create({
          purchaseOrderNumber,
          projectId: material.projectId,
          materialId: matId,
          vendorName: material.vendorName || 'Vendor',
          purchaseAmount: material.estimatedCost || 0,
          gst: 0,
          discount: 0,
          finalAmount: material.estimatedCost || 0,
          purchaseDate: new Date(),
          expectedDeliveryDate: new Date(),
          deliveryStatus: status === 'Bill Uploaded' ? 'Delivered' : 'Ordered',
          paymentStatus: 'Pending',
          status: status === 'Bill Uploaded' ? 'Completed' : 'Approved',
          attachments: status === 'Bill Uploaded' ? ['bill-invoice.pdf'] : [],
          remarks: material.description || material.remarks || 'Purchase order generated from material status',
          createdBy: effectiveUserId,
        });
      } else if (status === 'Bill Uploaded') {
        if (existingPurchase.attachments.length === 0) {
          existingPurchase.attachments = ['bill-invoice.pdf'];
        }
        existingPurchase.status = 'Completed';
        existingPurchase.deliveryStatus = 'Delivered';
        await existingPurchase.save();
      }
    }
  } catch (err) {
    console.error('Error syncing material related records:', err);
    // Catch internally to prevent throwing HTTP 500 in controllers
  }
};

// GET /api/materials
// Authenticated user - Retrieve materials with search, filter, and sort
export const getMaterials = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId, categoryId, search, status, priority, brand, assignedUser, sort } = req.query;

    const query: any = {};
    if (projectId && projectId !== 'undefined' && projectId !== 'null') {
      query.projectId = projectId;
    }

    if (categoryId && categoryId !== 'undefined' && categoryId !== 'null') {
      query.categoryId = categoryId;
    }

    // Search query (Material Name or Brand)
    if (search) {
      const searchRegex = new RegExp(String(search), 'i');
      query.$or = [
        { materialName: searchRegex },
        { brand: searchRegex },
      ];
    }

    // Status Filter
    if (status && status !== 'All') {
      query.status = status;
    }

    // Priority Filter
    if (priority && priority !== 'All') {
      query.priority = priority;
    }

    // Brand Filter
    if (brand && brand !== 'All') {
      query.brand = brand;
    }

    // Assigned User Filter
    if (assignedUser && assignedUser !== 'All') {
      query.assignedUser = assignedUser;
    }

    // Sorting logic
    let sortOption: any = { createdAt: -1 }; // default to newest
    if (sort === 'Oldest') {
      sortOption = { createdAt: 1 };
    } else if (sort === 'A-Z') {
      sortOption = { materialName: 1 };
    } else if (sort === 'Z-A') {
      sortOption = { materialName: -1 };
    } else if (sort === 'Priority') {
      // Custom priority sorting order High -> Medium -> Low can be mapped in aggregation, 
      // here we do standard sort on priority string or fallback to name
      sortOption = { priority: 1, materialName: 1 };
    } else if (sort === 'Status') {
      sortOption = { status: 1 };
    }

    const materials = await Material.find(query)
      .populate('categoryId', 'name color')
      .populate('assignedUser', 'name username profileImage role')
      .populate('createdBy', 'name username')
      .populate('lastUpdatedBy', 'name username')
      .populate('projectId', 'name')
      .sort(sortOption);

    res.status(200).json({
      success: true,
      count: materials.length,
      materials,
    });
  } catch (error) {
    console.error('getMaterials error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/materials
// Admin and Manager only - Create a material
export const createMaterial = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      projectId,
      categoryId,
      materialName,
      brand,
      description,
      quantity,
      unit,
      estimatedCost,
      vendorId,
      priority,
      status,
      remarks,
      assignedUser,
      materialImage,
      purchaseDeadline,
      materialSelectionDeadline,
      quotationSelectionDeadline,
      section,
      vendorName,
      transportCharges,
      stayAtSelection,
    } = req.body;
    const user = req.user;

    if (!projectId || !materialName) {
      res.status(400).json({ success: false, message: 'Required fields are missing' });
      return;
    }

    const initialStatus = status || 'Material Selection';
    const validCategoryId = (categoryId && categoryId !== 'undefined' && categoryId !== 'null' && categoryId !== '') ? categoryId : undefined;
    const validVendorId = (vendorId && vendorId !== 'undefined' && vendorId !== 'null' && vendorId !== '') ? vendorId : undefined;
    const validAssignedUser = (assignedUser && assignedUser !== 'undefined' && assignedUser !== 'null' && assignedUser !== '') ? assignedUser : undefined;

    const creatorId = user?._id || new mongoose.Types.ObjectId();
    const material = await Material.create({
      projectId,
      categoryId: validCategoryId,
      materialName,
      brand,
      description: description || '',
      quantity,
      unit: unit || 'pcs',
      estimatedCost: estimatedCost !== undefined ? estimatedCost : 0,
      transportCharges: transportCharges !== undefined ? transportCharges : 0,
      vendorId: validVendorId,
      priority: priority || 'Medium',
      status: initialStatus,
      stayAtSelection: !!stayAtSelection,
      assignedUser: validAssignedUser,
      materialImage: materialImage || '',
      purchaseDeadline: purchaseDeadline || '',
      materialSelectionDeadline: materialSelectionDeadline || '',
      quotationSelectionDeadline: quotationSelectionDeadline || '',
      remarks: remarks || '',
      section: section || '',
      vendorName: vendorName || '',
      createdBy: creatorId,
      createdByRole: user?.role || 'Architect',
      lastUpdatedBy: creatorId,
      lastUpdatedByRole: user?.role || 'Architect',
      lastUpdatedDate: new Date(),
      sectionedDate: ['Material Approve', 'Quotation Set', 'Awaiting Approval', 'Quotation Approved', 'Purchase Completed', 'Bill Uploaded'].includes(initialStatus) ? new Date() : undefined,
      selectionDate: new Date(),
      approvalDate: ['Quotation Set', 'Awaiting Approval', 'Quotation Approved', 'Purchase Completed', 'Bill Uploaded'].includes(initialStatus) ? new Date() : undefined,
    });

    // Auto-sync Quotation & Purchase records if status requires them
    await syncMaterialRelatedRecords(material, user?._id);

    // Create activity log entry
    await Activity.create({
      user: user?._id,
      action: `Created material request '${materialName}' for project`,
      project: projectId,
    });

    // AUTOMATIC NOTIFICATION: Task assigned (if assignedUser set on creation)
    if (validAssignedUser) {
      await sendNotificationToUser({
        recipientIds: [validAssignedUser],
        title: 'Task Assigned',
        message: `You have been assigned to task/material "${materialName}".`,
        category: 'Material',
        data: {
          type: 'task_assigned',
          materialId: material._id.toString(),
        },
        excludeUserId: user?._id,
      });
    }

    const populatedMaterial = await Material.findById(material._id)
      .populate('categoryId', 'name color')
      .populate('assignedUser', 'name username profileImage')
      .populate('createdBy', 'name username')
      .populate('lastUpdatedBy', 'name username');

    res.status(201).json({
      success: true,
      message: 'Material created successfully',
      material: populatedMaterial,
    });
  } catch (error: any) {
    console.error('createMaterial error:', error);
    res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
  }
};

// PUT /api/materials/:id
// All authenticated users can perform material updates
export const updateMaterial = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const material = await Material.findById(id);
    if (!material) {
      res.status(404).json({ success: false, message: 'Material not found' });
      return;
    }

    const updates = req.body;

    const oldAssignedUser = material.assignedUser ? material.assignedUser.toString() : null;
    const oldStatus = material.status;

    // Apply updates from request
    if (updates.materialName !== undefined) material.materialName = updates.materialName;
    if (updates.brand !== undefined) material.brand = updates.brand;
    if (updates.categoryId !== undefined) material.categoryId = (updates.categoryId && updates.categoryId !== 'undefined' && updates.categoryId !== 'null' && updates.categoryId !== '') ? updates.categoryId : undefined;
    if (updates.description !== undefined) material.description = updates.description;
    if (updates.quantity !== undefined) material.quantity = updates.quantity;
    if (updates.unit !== undefined) material.unit = updates.unit;
    if (updates.estimatedCost !== undefined) material.estimatedCost = updates.estimatedCost;
    if (updates.vendorId !== undefined) material.vendorId = (updates.vendorId && updates.vendorId !== 'undefined' && updates.vendorId !== 'null' && updates.vendorId !== '') ? updates.vendorId : undefined;
    if (updates.priority !== undefined) material.priority = updates.priority;
    if (updates.status !== undefined) {
      material.status = updates.status;
      if (updates.status === 'Material Approve') {
        (material as any).sectionedDate = new Date();
      } else if (updates.status === 'Material Selection') {
        (material as any).selectionDate = new Date();
      } else if (updates.status === 'Quotation Set') {
        (material as any).approvalDate = new Date();
      }
    }
    if (updates.assignedUser !== undefined) material.assignedUser = (updates.assignedUser && updates.assignedUser !== 'undefined' && updates.assignedUser !== 'null' && updates.assignedUser !== '') ? updates.assignedUser : undefined;
    if (updates.materialImage !== undefined) material.materialImage = updates.materialImage;
    if (updates.materialSelectionImage !== undefined) material.materialSelectionImage = updates.materialSelectionImage;
    if (updates.remarks !== undefined) material.remarks = updates.remarks;
    if (updates.purchaseDeadline !== undefined) material.purchaseDeadline = updates.purchaseDeadline;
    if (updates.materialSelectionDeadline !== undefined) material.materialSelectionDeadline = updates.materialSelectionDeadline;
    if (updates.quotationSelectionDeadline !== undefined) material.quotationSelectionDeadline = updates.quotationSelectionDeadline;
    if (updates.section !== undefined) material.section = updates.section;
    if (updates.vendorName !== undefined) material.vendorName = updates.vendorName;
    if (updates.transportCharges !== undefined) material.transportCharges = updates.transportCharges;
    if (updates.stayAtSelection !== undefined) material.stayAtSelection = updates.stayAtSelection;

    // Log last editor metrics
    material.lastUpdatedBy = user._id;
    material.lastUpdatedByRole = user.role;
    material.lastUpdatedDate = new Date();

    await material.save();

    // Auto-sync Quotation & Purchase records if status requires them
    await syncMaterialRelatedRecords(material, user._id);

    // Log activity
    await Activity.create({
      user: user._id,
      action: `Updated material specs for '${material.materialName}'`,
      project: material.projectId,
    });

    const updatedMaterial = await Material.findById(id)
      .populate('categoryId', 'name color')
      .populate('assignedUser', 'name username profileImage')
      .populate('createdBy', 'name username')
      .populate('lastUpdatedBy', 'name username');

    // AUTOMATIC NOTIFICATION: Task assigned or Task status changed
    const newAssignedUser = material.assignedUser ? material.assignedUser.toString() : null;
    const isAssignmentChanged = newAssignedUser && newAssignedUser !== oldAssignedUser;
    const isStatusChanged = updates.status !== undefined && updates.status !== oldStatus;

    if (isAssignmentChanged && newAssignedUser) {
      await sendNotificationToUser({
        recipientIds: [newAssignedUser],
        title: 'Task Assigned',
        message: `You have been assigned to task/material "${material.materialName}".`,
        category: 'Material',
        data: {
          type: 'task_assigned',
          materialId: material._id.toString(),
        },
        excludeUserId: user._id,
      });
    }

    if (isStatusChanged) {
      const recipientIds: any[] = [];
      if (material.createdBy) recipientIds.push(material.createdBy);
      if (material.assignedUser) recipientIds.push(material.assignedUser);

      await sendNotificationToUser({
        recipientIds,
        roles: ['Admin', 'Manager'],
        title: 'Task Status Updated',
        message: `Task/Material "${material.materialName}" status updated to "${material.status}".`,
        category: 'Material',
        data: {
          type: 'task_status_changed',
          materialId: material._id.toString(),
          status: material.status,
        },
        excludeUserId: user._id,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Material updated successfully',
      material: updatedMaterial,
    });
  } catch (error: any) {
    console.error('updateMaterial error:', error);
    res.status(500).json({ success: false, message: error?.message || 'Internal server error' });
  }
};

// DELETE /api/materials/:id
// Admin and Manager only - Delete material
export const deleteMaterial = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const user = req.user;

    const material = await Material.findById(id);
    if (!material) {
      res.status(404).json({ success: false, message: 'Material not found' });
      return;
    }

    // Find all Purchase records for this material to delete their related payments
    const purchases = await Purchase.find({ materialId: id }).select('_id');
    const purchaseIds = purchases.map(p => p._id);

    // Delete related Payments
    if (purchaseIds.length > 0) {
      await Payment.deleteMany({ purchaseId: { $in: purchaseIds } });
    }

    // Delete related Purchases, Quotations, Invoices, DocumentFiles, and MaterialWorkflows
    await Purchase.deleteMany({ materialId: id });
    await Quotation.deleteMany({ materialId: id });
    await Invoice.deleteMany({ materialId: id });
    await DocumentFile.deleteMany({ materialId: id });
    await MaterialWorkflow.deleteMany({ materialId: id });

    // Finally delete the material itself
    await Material.findByIdAndDelete(id);

    // Create log
    await Activity.create({
      user: user?._id,
      action: `Deleted material '${material.materialName}' and all its associated quotations, purchase details, payments, invoices, documents, and workflows`,
      project: material.projectId,
    });

    res.status(200).json({
      success: true,
      message: `Material '${material.materialName}' and its related details deleted successfully`,
    });
  } catch (error) {
    console.error('deleteMaterial error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
