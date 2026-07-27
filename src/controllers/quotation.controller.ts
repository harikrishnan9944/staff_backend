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
    const { materialId, vendor, amount, description, quotationImage } = req.body;

    if (!materialId || !vendor || amount === undefined) {
      res.status(400).json({ success: false, message: 'Required fields are missing' });
      return;
    }

    const material = await Material.findById(materialId);
    if (!material) {
      res.status(404).json({ success: false, message: 'Material request not found' });
      return;
    }

    if (['Registered', 'Sectioned', 'Material Selection'].includes(material.status)) {
      res.status(400).json({ 
        success: false, 
        message: 'Material request must be approved (Material Approve) before adding quotations.' 
      });
      return;
    }

    const quotation = await Quotation.create({
      materialId,
      vendor,
      amount,
      description,
      status: 'Pending',
      quotationImage: quotationImage || '',
    });

    // Transition Material status to 'Quotation Set'
    await Material.findByIdAndUpdate(materialId, { status: 'Quotation Set' });

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
    const { vendor, amount, description, status, quotationImage } = req.body;

    const quotation = await Quotation.findById(id);
    if (!quotation) {
      res.status(404).json({ success: false, message: 'Quotation not found' });
      return;
    }

    if (vendor !== undefined) quotation.vendor = vendor;
    if (amount !== undefined) quotation.amount = amount;
    if (description !== undefined) quotation.description = description;
    if (quotationImage !== undefined) quotation.quotationImage = quotationImage;

    // Handle quote approval
    if (status !== undefined) {
      // Authorization Check
      if (status === 'Selected') {
        if (req.user?.role !== 'Architect' && !['Admin', 'Manager', 'Head of Operations'].includes(req.user?.role || '')) {
          res.status(403).json({ success: false, message: 'Only Architects or Managers/Admins can select quotations' });
          return;
        }
      } else if (status === 'Approved' || status === 'Rejected') {
        if (!['Admin', 'Manager', 'Head of Operations'].includes(req.user?.role || '')) {
          res.status(403).json({ success: false, message: 'You do not have permission to approve/reject quotations' });
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

        // Update parent Material last updated details
        await Material.findByIdAndUpdate(quotation.materialId, {
          lastUpdatedBy: req.user?._id,
          lastUpdatedByRole: req.user?.role,
          lastUpdatedDate: new Date(),
        });
      } else if (status === 'Approved') {
        // Automatically reject all other quotes for the same material
        await Quotation.updateMany(
          { materialId: quotation.materialId, _id: { $ne: quotation._id } },
          { status: 'Rejected' }
        );

        // Transition Material status to 'Quotation Approved' and update last editor metrics
        await Material.findByIdAndUpdate(quotation.materialId, {
          status: 'Quotation Approved',
          lastUpdatedBy: req.user?._id,
          lastUpdatedByRole: req.user?.role,
          lastUpdatedDate: new Date(),
        });

        // Update MaterialWorkflow stage to 'Purchase'
        await MaterialWorkflow.findOneAndUpdate(
          { materialId: quotation.materialId },
          { status: 'Waiting for Purchase', currentStage: 'Purchase' }
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
    const { id } = req.params;

    const quotation = await Quotation.findById(id);
    if (!quotation) {
      res.status(404).json({ success: false, message: 'Quotation not found' });
      return;
    }

    await Quotation.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Quotation deleted successfully',
    });
  } catch (error) {
    console.error('deleteQuotation error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
