import { Router } from 'express';
import { getMaterials, createMaterial, updateMaterial, deleteMaterial } from '../controllers/material.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

// Public read access to materials
router.get('/', getMaterials);

// All mutation routes require authentication
router.use(authenticate);

// Full create/delete controls (All authenticated users can manage materials)
router.post('/', createMaterial);
router.delete('/:id', deleteMaterial);

// Update access (All authenticated users can modify materials)
router.put('/:id', updateMaterial);

export default router;
