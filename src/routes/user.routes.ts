import { Router } from 'express';
import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  updateStatus,
  resetPassword,
  getUserPermissions,
  assignProjectStaff,
  removeProjectStaff,
  getProjectStaff,
  getAuditLogs,
  getLoginHistory,
  updatePushToken,
  removePushToken,
} from '../controllers/user.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { registerSchema } from '../validation/auth.validation';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Push token registration & removal for logged-in user
router.post('/push-token', updatePushToken);
router.post('/remove-push-token', removePushToken);

// User directory & management operations
router.get('/', getUsers);
router.get('/audit-logs', authorize(['Admin']), getAuditLogs);
router.get('/login-history', authorize(['Admin']), getLoginHistory);
router.post('/', authorize(['Admin']), validateRequest(registerSchema), createUser);
router.post('/assign', authorize(['Admin']), assignProjectStaff);
router.post('/remove-assignment', authorize(['Admin']), removeProjectStaff);
router.put('/:id', authorize(['Admin']), updateUser);
router.delete('/:id', authorize(['Admin']), deleteUser);

router.patch('/status', authorize(['Admin']), updateStatus);
router.patch('/reset-password', authorize(['Admin']), resetPassword);

// Project staff retrieval
router.get('/project/:projectId', getProjectStaff);

// Shared operation: Get user's own merged permissions list
router.get('/permissions', getUserPermissions);

// Shared operation: User profile retrieval (controller handles Self vs Admin authorization)
router.get('/:id', getUserById);

export default router;
