import { Response } from 'express';
import mongoose from 'mongoose';
import { Quotation } from '../models/quotation.model';
import { Material } from '../models/material.model';
import { Project } from '../models/project.model';
import { MaterialWorkflow } from '../models/workflow.model';
import { ProjectMember } from '../models/projectMember.model';
import { AuthRequest } from '../middlewares/auth.middleware';
import { sendNotificationToUser, NotificationService } from '../services/notification.service';

// GET /api/quotations
export const getQuotations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { materialId } = req.query;
    
    const query: any = {};

    if (req.user && req.user.role !== 'Admin') {
      const userIdStr = req.user._id.toString();
      const userObjId = new mongoose.Types.ObjectId(userIdStr);

      const memberships = await ProjectMember.find({
        $or: [
          { userId: userObjId },
          { userId: userIdStr }
        ]
      });
      const memberProjectIds = memberships.map((m: any) => m.projectId.toString());

      const directProjects = await Project.find({
        $or: [
          { assignedUsers: userObjId },
          { assignedUsers: userIdStr }
        ]
      });
      const directProjectIds = directProjects.map((p: any) => p._id.toString());

      const userAssignedProjectIds = Array.from(new Set([...memberProjectIds, ...directProjectIds]));
      const userAssignedProjectObjIds = userAssignedProjectIds.map(id => new mongoose.Types.ObjectId(id));

      const assignedMaterials = await Material.find({ projectId: { $in: userAssignedProjectObjIds } }, '_id').lean();
      const assignedMaterialObjIds = assignedMaterials.map((m: any) => m._id);

      if (materialId && materialId !== 'undefined' && materialId !== 'null') {
        const matIdStr = String(materialId);
        const hasMat = assignedMaterials.some((m: any) => m._id.toString() === matIdStr);
        if (!hasMat) {
          query.materialId = { $in: [] };
        } else {
          query.materialId = new mongoose.Types.ObjectId(matIdStr);
        }
      } else {
        query.materialId = { $in: assignedMaterialObjIds };
      }
    } else if (materialId && materialId !== 'undefined' && materialId !== 'null') {
      query.materialId = new mongoose.Types.ObjectId(String(materialId));
    }

    const quotations = await Quotation.find(query)
      .populate({
        path: 'materialId',
        select: 'materialName brand unit projectId',
        populate: {
          path: 'projectId',
          select: 'name'
        }
      })
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: quotations.length,
      quotations,
    });
  } catch (error) {
    console.error('getQuotations error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/quotations
export const createQuotation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || !['Admin', 'Manager', 'Head of Operations', 'Staff', 'Supervisor', 'Purchase Supervisor', 'Architect'].includes(req.user.role || '')) {
      res.status(403).json({ success: false, message: 'Permission denied. Only authorized users can add quotations.' });
      return;
    }
    const { materialId, vendor, amount, description, quotationImage, transportCharges } = req.body;

    if (!materialId || !vendor || amount === undefined) {
      res.status(400).json({ success: false, message: 'Required fields are missing' });
      return;
    }

    const material = await Material.findById(materialId);
    if (!material) {
      res.status(404).json({ success: false, message: 'Material request not found' });
      return;
    }

    if (material.stayAtSelection) {
      res.status(400).json({ 
        success: false, 
        message: 'Materials marked with Stay at Selection remain strictly in Selection stage and cannot advance to Quotations.' 
      });
      return;
    }

    if (['Registered', 'Material Selection', 'Material Approve', 'Sectioned'].includes(material.status)) {
      res.status(400).json({ 
        success: false, 
        message: 'Material request must be approved by Manager/Admin (Quotation Set) before adding quotations.' 
      });
      return;
    }

    const isRFQ = vendor === 'Awaiting Quotation' || Number(amount) === 0;
    const requestedStatus = req.body.status;
    const targetQuoteStatus = requestedStatus === 'Approved' ? 'Approved' : 'Pending';

    const quotation = await Quotation.create({
      materialId,
      vendor,
      amount,
      description,
      status: targetQuoteStatus,
      quotationImage: quotationImage || '',
      transportCharges: transportCharges !== undefined ? Number(transportCharges) : 0,
    });

    const projectRecipientIds = await NotificationService.getProjectInvolvedUserIds(material.projectId);

    if (targetQuoteStatus === 'Approved') {
      // Transition Material status to 'Quotation Approved' directly
      await Material.findByIdAndUpdate(materialId, { 
        status: 'Quotation Approved',
        estimatedCost: amount,
        vendorName: vendor,
        transportCharges: transportCharges !== undefined ? Number(transportCharges) : 0
      });

      // Sync workflow stage to Purchase phase (Progress 60)
      await MaterialWorkflow.findOneAndUpdate(
        { materialId },
        { status: 'Waiting for Purchase', currentStage: 'Purchase', progress: 60 },
        { upsert: true }
      );
    } else if (isRFQ) {
      // Transition Material status to 'Quotation Set'
      await Material.findByIdAndUpdate(materialId, { status: 'Quotation Set' });
      
      await sendNotificationToUser({
        recipientIds: projectRecipientIds,
        roles: ['Admin', 'Head of Operations', 'Manager', 'Staff'],
        excludeUserId: req.user?._id,
        title: '📄 New Quotation Requested',
        message: `Quotation request created for material '${material.materialName}' — Ready for supplier rates. 📋`,
        category: 'Quotation',
        data: {
          type: 'quotation_requested',
          materialId: materialId.toString(),
          materialName: material.materialName,
        },
      });
    } else {
      // Transition Material status to 'Awaiting Approval' for quote approval
      await Material.findByIdAndUpdate(materialId, { 
        status: 'Awaiting Approval',
        estimatedCost: amount,
        vendorName: vendor,
        transportCharges: transportCharges !== undefined ? Number(transportCharges) : 0
      });

      // Sync workflow stage to Quotation Approval phase (Progress 55)
      await MaterialWorkflow.findOneAndUpdate(
        { materialId },
        { status: 'Awaiting Approval', currentStage: 'Quotation', progress: 55 },
        { upsert: true }
      );

      await sendNotificationToUser({
        recipientIds: projectRecipientIds,
        roles: ['Admin', 'Head of Operations', 'Manager', 'Staff'],
        excludeUserId: req.user?._id,
        title: '⏳ Quotation Submitted for Approval',
        message: `Quotation of ₹${Number(amount).toLocaleString()} from '${vendor}' submitted for '${material.materialName}' — Awaiting approval. ⏳`,
        category: 'Quotation',
        data: {
          type: 'material_ready_for_approval',
          quotationId: quotation._id.toString(),
          materialId: materialId.toString(),
          materialName: material.materialName,
        },
      });
    }

    // AUTOMATIC NOTIFICATION: Only trigger if quotation is approved
    if (quotation.status === 'Approved') {
      // Notification 4: Quotation Approved
      await sendNotificationToUser({
        recipientIds: projectRecipientIds,
        roles: ['Admin', 'Head of Operations', 'Manager', 'Staff'],
        excludeUserId: req.user?._id,
        title: '🎉 Quotation Approved Successfully',
        message: `Quotation for material '${material.materialName}' has been approved and is ready for purchase! ✅`,
        category: 'Quotation',
        data: {
          type: 'quotation_approved',
          quotationId: quotation._id.toString(),
          materialId: materialId.toString(),
        },
      });

      // Notification 5: Material Sent to Purchase
      await sendNotificationToUser({
        recipientIds: projectRecipientIds,
        roles: ['Admin', 'Head of Operations', 'Manager', 'Staff', 'Purchase Supervisor', 'Supervisor'],
        excludeUserId: req.user?._id,
        title: '🛍️ Ready for Purchase',
        message: `Material '${material.materialName}' is approved — Ready for purchase. 🚚`,
        category: 'Purchase',
        data: {
          type: 'material_sent_to_purchase',
          materialId: materialId.toString(),
          materialName: material.materialName,
        },
      });
    }

    res.status(201).json({
      success: true,
      message: 'Quotation submitted successfully',
      quotation,
    });
  } catch (error) {
    console.error('createQuotation error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PUT /api/quotations/:id
export const updateQuotation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { vendor, amount, description, status, quotationImage, transportCharges } = req.body;

    const quotation = await Quotation.findById(id);
    if (!quotation) {
      res.status(404).json({ success: false, message: 'Quotation not found' });
      return;
    }

    if (vendor !== undefined) quotation.vendor = vendor;
    if (amount !== undefined) quotation.amount = amount;
    if (description !== undefined) quotation.description = description;
    if (quotationImage !== undefined) quotation.quotationImage = quotationImage;
    if (transportCharges !== undefined) quotation.transportCharges = Number(transportCharges);

    // If quotation is updated with amount or vendor without explicit status, set status to Pending and material to Awaiting Approval
    const hasRateDetails = (amount !== undefined || vendor !== undefined) && status === undefined;
    if (hasRateDetails) {
      quotation.status = 'Pending';

      const updateVendor = vendor !== undefined ? vendor : (quotation.vendor || 'Selected Supplier');
      const updateCost = amount !== undefined ? Number(amount) : (quotation.amount || 0);

      // Transition Material status to 'Awaiting Approval'
      await Material.findByIdAndUpdate(quotation.materialId, {
        status: 'Awaiting Approval',
        estimatedCost: updateCost,
        vendorName: updateVendor,
        transportCharges: transportCharges !== undefined ? Number(transportCharges) : (quotation.transportCharges || 0),
        lastUpdatedBy: req.user?._id,
        lastUpdatedByRole: req.user?.role,
        lastUpdatedDate: new Date(),
      });

      // Sync workflow stage to Quotation Approval phase (Progress 55)
      await MaterialWorkflow.findOneAndUpdate(
        { materialId: quotation.materialId },
        { status: 'Awaiting Approval', currentStage: 'Quotation', progress: 55 },
        { upsert: true }
      );
    }

    // Handle quote approval
    if (status !== undefined) {
      // Authorization Check
      if (status === 'Selected') {
        if (!req.user || !['Admin', 'Manager', 'Head of Operations'].includes(req.user.role || '')) {
          res.status(403).json({ success: false, message: 'Permission denied. Only Admin, Manager, and Head of Operations can select quotations.' });
          return;
        }
      } else if (status === 'Approved' || status === 'Rejected') {
        if (!req.user || !['Admin', 'Manager', 'Head of Operations'].includes(req.user.role || '')) {
          res.status(403).json({ success: false, message: 'Permission denied. Only Admin, Manager, and Head of Operations can approve/reject quotations.' });
          return;
        }
      }

      quotation.status = status;

      if (status === 'Selected') {
        // Automatically set any other 'Selected' quote for the same material back to 'Pending'
        await Quotation.updateMany(
          { materialId: quotation.materialId, status: 'Selected', _id: { $ne: quotation._id } },
          { status: 'Pending' }
        );

        // Update parent Material last updated details and set status to 'Awaiting Approval'
        await Material.findByIdAndUpdate(quotation.materialId, {
          status: 'Awaiting Approval',
          lastUpdatedBy: req.user?._id,
          lastUpdatedByRole: req.user?.role,
          lastUpdatedDate: new Date(),
        });

        // Sync workflow stage to Quotation Approval (Progress 55)
        await MaterialWorkflow.findOneAndUpdate(
          { materialId: quotation.materialId },
          { status: 'Awaiting Approval', currentStage: 'Quotation', progress: 55 },
          { upsert: true }
        );
      } else if (status === 'Approved') {
        // Automatically reject all other quotes for the same material
        await Quotation.updateMany(
          { materialId: quotation.materialId, _id: { $ne: quotation._id } },
          { status: 'Rejected' }
        );

        // Transition Material status to 'Quotation Approved' and update last editor metrics
        await Material.findByIdAndUpdate(quotation.materialId, {
          status: 'Quotation Approved',
          estimatedCost: Number(amount !== undefined ? amount : quotation.amount),
          vendorName: vendor !== undefined ? vendor : quotation.vendor,
          transportCharges: transportCharges !== undefined ? Number(transportCharges) : (quotation.transportCharges || 0),
          lastUpdatedBy: req.user?._id,
          lastUpdatedByRole: req.user?.role,
          lastUpdatedDate: new Date(),
        });

        // Update MaterialWorkflow stage to 'Purchase'
        await MaterialWorkflow.findOneAndUpdate(
          { materialId: quotation.materialId },
          { status: 'Waiting for Purchase', currentStage: 'Purchase', progress: 60 },
          { upsert: true }
        );
      } else if (status === 'Pending') {
        // Automatically reset all other rejected quotes for the same material back to pending
        await Quotation.updateMany(
          { materialId: quotation.materialId, status: 'Rejected' },
          { status: 'Pending' }
        );

        // Transition Material status back to 'Quotation Set' and clear estimation fields
        await Material.findByIdAndUpdate(quotation.materialId, {
          status: 'Quotation Set',
          estimatedCost: 0,
          vendorName: '',
          transportCharges: 0,
          lastUpdatedBy: req.user?._id,
          lastUpdatedByRole: req.user?.role,
          lastUpdatedDate: new Date(),
        });

        // Update MaterialWorkflow stage to 'Quotation Selection' (progress 40)
        await MaterialWorkflow.findOneAndUpdate(
          { materialId: quotation.materialId },
          { status: 'Quotation Selection', currentStage: 'Quotation', progress: 40 },
          { upsert: true }
        );
      }
    }

    await quotation.save();

    // Fetch Material & Project details for notification context
    const materialDoc = await Material.findById(quotation.materialId).select('materialName projectId').lean();
    const matName = materialDoc?.materialName || 'Material';
    const projDoc = materialDoc?.projectId ? await Project.findById(materialDoc.projectId).select('name').lean() : null;
    const projName = projDoc?.name || 'Project';

    const projectRecipientIds = materialDoc?.projectId 
      ? await NotificationService.getProjectInvolvedUserIds(materialDoc.projectId)
      : [];

    // AUTOMATIC NOTIFICATION: Material Ready for Approval, Quotation Approved, Material Sent to Purchase
    if (status === 'Selected') {
      // Notification 3: Material Ready for Approval (Send to approvers & project members)
      await sendNotificationToUser({
        recipientIds: projectRecipientIds,
        roles: ['Admin', 'Manager', 'Head of Operations'],
        excludeUserId: req.user?._id,
        title: '⏳ Ready for Approval',
        message: `Quotation for material '${matName}' in project '${projName}' is ready for your approval. ✅`,
        category: 'Quotation',
        data: {
          type: 'material_ready_for_approval',
          quotationId: quotation._id.toString(),
          materialId: quotation.materialId.toString(),
          materialName: matName,
          projectName: projName,
        },
      });
    } else if (status === 'Approved') {
      // Notification 4: Quotation Approved
      await sendNotificationToUser({
        recipientIds: projectRecipientIds,
        roles: ['Admin', 'Head of Operations', 'Manager', 'Staff'],
        excludeUserId: req.user?._id,
        title: '🎉 Quotation Approved Successfully',
        message: `Quotation for material '${matName}' in project '${projName}' has been approved successfully. ✅`,
        category: 'Quotation',
        data: {
          type: 'quotation_approved',
          quotationId: quotation._id.toString(),
          materialId: quotation.materialId.toString(),
          materialName: matName,
          projectName: projName,
        },
      });

      // Notification 5: Material Sent to Purchase
      await sendNotificationToUser({
        recipientIds: projectRecipientIds,
        roles: ['Admin', 'Head of Operations', 'Manager', 'Staff', 'Purchase Supervisor', 'Supervisor'],
        excludeUserId: req.user?._id,
        title: '🛍️ Ready for Purchase',
        message: `Quotation approved for material '${matName}' in project '${projName}' — Ready for purchase. 🚚`,
        category: 'Purchase',
        data: {
          type: 'material_sent_to_purchase',
          materialId: quotation.materialId.toString(),
          materialName: matName,
          projectName: projName,
        },
      });
    }

    res.status(200).json({
      success: true,
      message: 'Quotation updated successfully',
      quotation,
    });
  } catch (error) {
    console.error('updateQuotation error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// DELETE /api/quotations/:id
export const deleteQuotation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || !['Admin', 'Manager', 'Head of Operations'].includes(req.user.role || '')) {
      res.status(403).json({ success: false, message: 'Permission denied. Only Admin, Manager, and Head of Operations can delete quotations.' });
      return;
    }
    const { id } = req.params;

    const quotation = await Quotation.findById(id);
    if (!quotation) {
      res.status(404).json({ success: false, message: 'Quotation not found' });
      return;
    }

    const wasApproved = quotation.status === 'Approved';

    await Quotation.findByIdAndDelete(id);

    if (wasApproved) {
      // Revert other rejected quotes back to pending
      await Quotation.updateMany(
        { materialId: quotation.materialId, status: 'Rejected' },
        { status: 'Pending' }
      );

      // Revert Material back to Quotation Set
      await Material.findByIdAndUpdate(quotation.materialId, {
        status: 'Quotation Set',
        estimatedCost: 0,
        vendorName: '',
        transportCharges: 0,
        lastUpdatedBy: req.user?._id,
        lastUpdatedByRole: req.user?.role,
        lastUpdatedDate: new Date(),
      });

      // Update MaterialWorkflow
      await MaterialWorkflow.findOneAndUpdate(
        { materialId: quotation.materialId },
        { status: 'Quotation Selection', currentStage: 'Quotation', progress: 40 },
        { upsert: true }
      );
    }

    res.status(200).json({
      success: true,
      message: 'Quotation deleted successfully',
    });
  } catch (error) {
    console.error('deleteQuotation error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
