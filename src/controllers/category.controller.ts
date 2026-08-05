import { Request, Response } from 'express';
import { Category } from '../models/category.model';

// GET /api/categories — list all categories
export const getCategories = async (req: Request, res: Response): Promise<void> => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.json({ success: true, categories });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch categories' });
  }
};

// POST /api/categories — create a new category
export const createCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, color } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ success: false, message: 'Category name is required' });
      return;
    }

    // Check if category with same name already exists (case-insensitive)
    const existing = await Category.findOne({ name: { $regex: `^${name.trim()}$`, $options: 'i' } });
    if (existing) {
      res.json({ success: true, category: existing });
      return;
    }

    const category = await Category.create({ name: name.trim(), color: color || '#CCCCCC' });
    res.status(201).json({ success: true, category });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to create category' });
  }
};

// GET /api/categories/:id — get single category
export const getCategoryById = async (req: Request, res: Response): Promise<void> => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      res.status(404).json({ success: false, message: 'Category not found' });
      return;
    }
    res.json({ success: true, category });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message || 'Failed to fetch category' });
  }
};
