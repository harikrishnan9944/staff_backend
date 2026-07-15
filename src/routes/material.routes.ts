import { Router } from 'express';
import { getMaterials, createMaterial, updateMaterial, deleteMaterial } from '../controllers/material.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Public read access to materials
router.get('/', getMaterials);

// Full create/delete controls (All authenticated users can manage materials)
router.post('/', createMaterial);
router.delete('/:id', deleteMaterial);

// Update access (All authenticated users can modify materials)
router.put('/:id', updateMaterial);

export default router;
