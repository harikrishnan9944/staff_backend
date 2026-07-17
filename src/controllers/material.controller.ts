import { Response } from 'express';
import { Material } from '../models/material.model';
import { Project } from '../models/project.model';
import { Activity } from '../models/activity.model';
import { AuthRequest } from '../middlewares/auth.middleware';

// GET /api/materials
// Authenticated user - Retrieve materials with search, filter, and sort
export const getMaterials = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId, categoryId, search, status, priority, brand, assignedUser, sort } = req.query;

    const query: any = {};
    if (projectId) {
      query.projectId = projectId;
    }

    if (categoryId) {
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
      remarks,
      assignedUser,
      materialImage,
    } = req.body;
    const user = req.user;

    if (!projectId || !materialName || !brand || quantity === undefined) {
      res.status(400).json({ success: false, message: 'Required fields are missing' });
      return;
    }

    const material = await Material.create({
      projectId,
      categoryId: categoryId || undefined,
      materialName,
      brand,
      description: description || '',
      quantity,
      unit: unit || 'pcs',
      estimatedCost: estimatedCost !== undefined ? estimatedCost : 0,
      vendorId,
      priority: priority || 'Medium',
      status: 'Registered',
      assignedUser,
      materialImage: materialImage || '',
      remarks: remarks || '',
      createdBy: user?._id,
      createdByRole: user?.role || 'Architect',
    });

    // Create activity log entry
    await Activity.create({
      user: user?._id,
      action: `Created material '${materialName}' for project`,
      project: projectId,
    });

    const populatedMaterial = await Material.findById(material._id)
      .populate('categoryId', 'name color')
      .populate('assignedUser', 'name username profileImage')
      .populate('createdBy', 'name username');

    res.status(201).json({
      success: true,
      message: 'Material created successfully',
      material: populatedMaterial,
    });
  } catch (error) {
    console.error('createMaterial error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
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

    // Apply updates from request
    if (updates.materialName !== undefined) material.materialName = updates.materialName;
    if (updates.brand !== undefined) material.brand = updates.brand;
    if (updates.categoryId !== undefined) material.categoryId = updates.categoryId;
    if (updates.description !== undefined) material.description = updates.description;
    if (updates.quantity !== undefined) material.quantity = updates.quantity;
    if (updates.unit !== undefined) material.unit = updates.unit;
    if (updates.estimatedCost !== undefined) material.estimatedCost = updates.estimatedCost;
    if (updates.vendorId !== undefined) material.vendorId = updates.vendorId;
    if (updates.priority !== undefined) material.priority = updates.priority;
    if (updates.status !== undefined) material.status = updates.status;
    if (updates.assignedUser !== undefined) material.assignedUser = updates.assignedUser;
    if (updates.materialImage !== undefined) material.materialImage = updates.materialImage;
    if (updates.remarks !== undefined) material.remarks = updates.remarks;

    // Log last editor metrics
    material.lastUpdatedBy = user._id;
    material.lastUpdatedByRole = user.role;
    material.lastUpdatedDate = new Date();

    await material.save();

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

    res.status(200).json({
      success: true,
      message: 'Material updated successfully',
      material: updatedMaterial,
    });
  } catch (error) {
    console.error('updateMaterial error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
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

    await Material.findByIdAndDelete(id);

    // Create log
    await Activity.create({
      user: user?._id,
      action: `Deleted material '${material.materialName}'`,
      project: material.projectId,
    });

    res.status(200).json({
      success: true,
      message: `Material '${material.materialName}' deleted successfully`,
    });
  } catch (error) {
    console.error('deleteMaterial error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
