import { Response } from 'express';
import { Quotation } from '../models/quotation.model';
import { Material } from '../models/material.model';
import { Project } from '../models/project.model';
import { MaterialWorkflow } from '../models/workflow.model';
import { AuthRequest } from '../middlewares/auth.middleware';

// GET /api/quotations
export const getQuotations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { materialId } = req.query;
    
    const query: any = {};
    if (materialId && materialId !== 'undefined' && materialId !== 'null') {
      query.materialId = materialId;
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
    if (!req.user || !['Admin', 'Manager', 'Head of Operations'].includes(req.user.role || '')) {
      res.status(403).json({ success: false, message: 'Permission denied. Only Admin, Manager, and Head of Operations can add quotations.' });
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

    if (['Registered', 'Material Selection', 'Material Approve', 'Sectioned'].includes(material.status) && !material.stayAtSelection) {
      res.status(400).json({ 
        success: false, 
        message: 'Material request must be approved by Manager/Admin (Quotation Set) before adding quotations.' 
      });
      return;
    }

    const isRFQ = vendor === 'Awaiting Quotation' || Number(amount) === 0;

    const quotation = await Quotation.create({
      materialId,
      vendor,
      amount,
      description,
      status: isRFQ ? 'Pending' : 'Approved',
      quotationImage: quotationImage || '',
      transportCharges: transportCharges !== undefined ? Number(transportCharges) : 0,
    });

    if (isRFQ) {
      // Transition Material status to 'Quotation Set'
      await Material.findByIdAndUpdate(materialId, { status: 'Quotation Set' });
    } else {
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

    // If quotation is updated with a real vendor and amount, auto-approve it
    const isNewRealQuote = vendor !== undefined && amount !== undefined && vendor !== 'Awaiting Quotation' && Number(amount) > 0;
    if (isNewRealQuote && status === undefined) {
      quotation.status = 'Approved';
      
      // Automatically reject all other quotes for the same material
      await Quotation.updateMany(
        { materialId: quotation.materialId, _id: { $ne: quotation._id } },
        { status: 'Rejected' }
      );

      // Transition Material status to 'Quotation Approved'
      await Material.findByIdAndUpdate(quotation.materialId, {
        status: 'Quotation Approved',
        estimatedCost: Number(amount),
        vendorName: vendor,
        transportCharges: transportCharges !== undefined ? Number(transportCharges) : (quotation.transportCharges || 0),
        lastUpdatedBy: req.user?._id,
        lastUpdatedByRole: req.user?.role,
        lastUpdatedDate: new Date(),
      });

      // Sync workflow stage to Purchase phase (Progress 60)
      await MaterialWorkflow.findOneAndUpdate(
        { materialId: quotation.materialId },
        { status: 'Waiting for Purchase', currentStage: 'Purchase', progress: 60 },
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
