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
    if (materialId) {
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
    const { materialId, vendor, amount, description } = req.body;

    if (!materialId || !vendor || amount === undefined) {
      res.status(400).json({ success: false, message: 'Required fields are missing' });
      return;
    }

    const quotation = await Quotation.create({
      materialId,
      vendor,
      amount,
      description,
      status: 'Pending',
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
    const { vendor, amount, description, status } = req.body;

    const quotation = await Quotation.findById(id);
    if (!quotation) {
      res.status(404).json({ success: false, message: 'Quotation not found' });
      return;
    }

    if (vendor !== undefined) quotation.vendor = vendor;
    if (amount !== undefined) quotation.amount = amount;
    if (description !== undefined) quotation.description = description;

    // Handle quote approval
    if (status !== undefined) {
      quotation.status = status;
      if (status === 'Approved') {
        // Automatically reject all other quotes for the same material
        await Quotation.updateMany(
          { materialId: quotation.materialId, _id: { $ne: quotation._id } },
          { status: 'Rejected' }
        );

        // Transition Material status to 'Quotation Approved'
        await Material.findByIdAndUpdate(quotation.materialId, { status: 'Quotation Approved' });

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
