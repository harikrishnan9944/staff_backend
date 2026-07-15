import { Router } from 'express';
import { 
  getProjects, 
  createProject, 
  updateProject, 
  deleteProject 
} from '../controllers/project.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.get('/', getProjects);
router.post('/', createProject);
router.put('/:id', updateProject);
router.delete('/:id', deleteProject);

export default router;
