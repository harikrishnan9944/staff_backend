import { Router } from 'express';
import {
  getDocuments,
  createDocument,
  updateDocumentVersion,
  documentAction,
  deleteDocument,
  getStorageUsage,
} from '../controllers/document.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getDocuments);
router.get('/storage-usage', getStorageUsage);
router.post('/', createDocument);
router.put('/:id', updateDocumentVersion);
router.patch('/:id/actions', documentAction);
router.delete('/:id', authorize(['Admin']), deleteDocument);

export default router;
