import { Response } from 'express';
import { DocumentFile } from '../models/document.model';
import { Activity } from '../models/activity.model';
import { AuthRequest } from '../middlewares/auth.middleware';
import { uploadToCloudinary } from '../config/cloudinary';
import { sendNotificationToUser } from '../services/notification.service';

// Get storage usage summary
export const getStorageUsage = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const files = await DocumentFile.find({ 'activityLog.action': { $ne: 'Trash' } });
    
    // Aggregation of file types sizes
    let totalSize = 0;
    const sizeByType: Record<string, number> = { PDF: 0, Image: 0, Excel: 0, Word: 0, CAD: 0, ZIP: 0 };

    files.forEach((f) => {
      totalSize += f.fileSize;
      const type = f.fileType;
      if (sizeByType[type] !== undefined) {
        sizeByType[type] += f.fileSize;
      }
    });

    res.status(200).json({
      success: true,
      totalSize, // total bytes
      sizeByType,
    });
  } catch (error) {
    console.error('getStorageUsage error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Retrieve Documents Explorer
export const getDocuments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { folder, projectId, search, isFavorite, inTrash } = req.query;

    const query: any = {};

    if (folder && folder !== 'All') query.folder = folder;
    if (projectId && projectId !== 'All') query.projectId = projectId;
    if (isFavorite === 'true') {
      query.isFavorite = true;
    }

    // In trash filter
    if (inTrash === 'true') {
      query.isTrashed = true;
    } else {
      query.isTrashed = { $ne: true };
    }

    if (search) {
      query.name = new RegExp(String(search), 'i');
    }

    const documents = await DocumentFile.find(query)
      .populate('projectId', 'name')
      .populate('uploadedBy', 'name username role')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: documents.length,
      documents,
    });
  } catch (error) {
    console.error('getDocuments error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/documents (Upload to Cloudinary and register Document metadata)
export const createDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, fileBase64, fileType, fileSize, folder, projectId, materialId, vendorId, purchaseId, invoiceId } = req.body;
    const user = req.user;

    if (!name || !fileBase64 || !fileType || !fileSize || !folder) {
      res.status(400).json({ success: false, message: 'Required fields are missing' });
      return;
    }

    // Upload to Cloudinary
    console.log(`Uploading file ${name} to Cloudinary...`);
    const fileUrl = await uploadToCloudinary(fileBase64);

    const doc = await DocumentFile.create({
      name,
      fileUrl,
      fileType,
      fileSize,
      folder,
      projectId,
      materialId,
      vendorId,
      purchaseId,
      invoiceId,
      version: 1,
      activityLog: [
        {
          action: 'Uploaded version 1',
          userId: user?._id,
          timestamp: new Date(),
        },
      ],
      uploadedBy: user?._id,
    });

    await Activity.create({
      user: user?._id,
      action: `Uploaded Document '${name}' to folder '${folder}'`,
      project: projectId,
    });

    // AUTOMATIC NOTIFICATION: New Document Uploaded
    await sendNotificationToUser({
      roles: ['Admin', 'Head of Operations', 'Manager', 'Staff'],
      title: 'New Document Uploaded',
      message: `Document "${name}" was uploaded to folder "${folder}".`,
      category: 'System',
      data: {
        type: 'document_uploaded',
        documentId: doc._id.toString(),
        name,
        folder,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully',
      document: doc,
    });
  } catch (error) {
    console.error('createDocument error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PUT /api/documents/:id (Replace / Upload new version)
export const updateDocumentVersion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { fileBase64, fileSize } = req.body;
    const user = req.user;

    const doc = await DocumentFile.findById(id);
    if (!doc) {
      res.status(404).json({ success: false, message: 'Document not found' });
      return;
    }

    if (fileBase64 && fileSize) {
      console.log(`Replacing document '${doc.name}' with new version...`);
      const fileUrl = await uploadToCloudinary(fileBase64);

      const nextVersion = doc.version + 1;
      doc.fileUrl = fileUrl;
      doc.fileSize = fileSize;
      doc.version = nextVersion;
      
      doc.activityLog.push({
        action: `Uploaded version ${nextVersion}`,
        userId: user?._id as any,
        timestamp: new Date(),
      });

      await doc.save();

      await Activity.create({
        user: user?._id,
        action: `Uploaded Version ${nextVersion} of Document '${doc.name}'`,
        project: doc.projectId,
      });

      res.status(200).json({
        success: true,
        message: `Uploaded new version V${nextVersion} successfully`,
        document: doc,
      });
    } else {
      res.status(400).json({ success: false, message: 'New file details are missing' });
    }
  } catch (error) {
    console.error('updateDocumentVersion error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PATCH /api/documents/:id/actions (Rename, Favorite, Move to Trash, Restore)
export const documentAction = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { action, name, isFavorite, destinationFolder } = req.body;
    const user = req.user;

    const doc = await DocumentFile.findById(id);
    if (!doc) {
      res.status(404).json({ success: false, message: 'Document not found' });
      return;
    }

    if (action === 'rename' && name) {
      const oldName = doc.name;
      doc.name = name;
      doc.activityLog.push({
        action: `Renamed from '${oldName}' to '${name}'`,
        userId: user?._id as any,
        timestamp: new Date(),
      });
      await doc.save();
      res.status(200).json({ success: true, message: `Renamed to ${name} successfully`, document: doc });
      return;
    }

    if (action === 'favorite') {
      doc.set('isFavorite', isFavorite); // Set dynamically as custom field
      await doc.save();
      res.status(200).json({ success: true, message: isFavorite ? 'Added to favorites' : 'Removed from favorites', document: doc });
      return;
    }

    if (action === 'trash') {
      doc.set('isTrashed', true);
      doc.activityLog.push({
        action: 'Moved to Recycle Bin',
        userId: user?._id as any,
        timestamp: new Date(),
      });
      await doc.save();
      res.status(200).json({ success: true, message: 'Document moved to Recycle Bin', document: doc });
      return;
    }

    if (action === 'restore') {
      doc.set('isTrashed', false);
      doc.activityLog.push({
        action: 'Restored from Recycle Bin',
        userId: user?._id as any,
        timestamp: new Date(),
      });
      await doc.save();
      res.status(200).json({ success: true, message: 'Document restored from Recycle Bin', document: doc });
      return;
    }

    if (action === 'move' && destinationFolder) {
      const oldFolder = doc.folder;
      doc.folder = destinationFolder;
      doc.activityLog.push({
        action: `Moved from '${oldFolder}' folder to '${destinationFolder}' folder`,
        userId: user?._id as any,
        timestamp: new Date(),
      });
      await doc.save();
      res.status(200).json({ success: true, message: `Moved to folder ${destinationFolder} successfully`, document: doc });
      return;
    }

    res.status(400).json({ success: false, message: 'Invalid file action parameter' });
  } catch (error) {
    console.error('documentAction error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// DELETE /api/documents/:id (Permanent Delete - Admin only)
export const deleteDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const doc = await DocumentFile.findById(id);
    if (!doc) {
      res.status(404).json({ success: false, message: 'Document not found' });
      return;
    }

    await DocumentFile.findByIdAndDelete(id);

    await Activity.create({
      user: req.user?._id,
      action: `Permanently deleted Document '${doc.name}'`,
      project: doc.projectId,
    });

    res.status(200).json({
      success: true,
      message: `Document '${doc.name}' permanently deleted`,
    });
  } catch (error) {
    console.error('deleteDocument error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
