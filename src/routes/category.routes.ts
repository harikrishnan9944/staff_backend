import { Router } from 'express';
import { getCategories, createCategory, getCategoryById } from '../controllers/category.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.get('/', authenticate, getCategories);
router.post('/', authenticate, createCategory);
router.get('/:id', authenticate, getCategoryById);

export default router;
