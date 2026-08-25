import { Response } from 'express';
import { Project } from '../models/project.model';
import { ProjectMember } from '../models/projectMember.model';
import { User } from '../models/user.model';
import { AuthRequest } from '../middlewares/auth.middleware';
import { sendNotificationToUser, NotificationService } from '../services/notification.service';
import { Material } from '../models/material.model';
import { Quotation } from '../models/quotation.model';
import { Purchase } from '../models/purchase.model';
import { Invoice } from '../models/invoice.model';
import { Payment } from '../models/payment.model';
import { DocumentFile } from '../models/document.model';
import { MaterialWorkflow } from '../models/workflow.model';

// GET /api/projects
export const getProjects = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const query: any = {};

    // Filter projects by assignment for non-Admin roles
    if (user && user.role !== 'Admin') {
      const memberships = await ProjectMember.find({ userId: user._id });
      const memberProjectIds = memberships.map(m => m.projectId.toString());
      
      const directProjects = await Project.find({ assignedUsers: user._id });
      const directProjectIds = directProjects.map(p => p._id.toString());
      
      const uniqueProjectIds = Array.from(new Set([...memberProjectIds, ...directProjectIds]));
      query._id = { $in: uniqueProjectIds };
    }

    const projects = await Project.find(query).sort({ createdAt: -1 });

    const projectsWithMembers = await Promise.all(
      projects.map(async (project) => {
        const members = await ProjectMember.find({ projectId: project._id })
          .populate('userId', 'name username role email phone profileImage employeeId department isActive');
        
        const memberUsers = members.map(m => {
          if (m.userId) {
            const uObj = (m.userId as any).toObject ? (m.userId as any).toObject() : m.userId;
            return { ...uObj, role: m.role || uObj.role };
          }
          return null;
        }).filter(Boolean);

        const directUsers = await User.find({ _id: { $in: project.assignedUsers || [] } }, 'name username role email phone profileImage employeeId department isActive').lean();

        const userMap = new Map();
        [...directUsers, ...memberUsers].forEach((u: any) => {
          if (u && (u._id || u.id)) {
            userMap.set(String(u._id || u.id), u);
          }
        });

        const mergedAssignedUsers = Array.from(userMap.values());

        return {
          ...project.toObject(),
          assignedUsers: mergedAssignedUsers,
          assignedStaff: mergedAssignedUsers,
        };
      })
    );

    res.status(200).json({
      success: true,
      count: projectsWithMembers.length,
      projects: projectsWithMembers,
    });
  } catch (error) {
    console.error('getProjects error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/projects
export const createProject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || req.user.role !== 'Admin') {
      res.status(403).json({ success: false, message: 'Permission denied. Only Admin can create projects.' });
      return;
    }
    const { name, clientName, location, startDate, expectedEndDate, status, remarks, assignedUsers, deletePassword } = req.body;

    if (!name) {
      res.status(400).json({ success: false, message: 'Name is required' });
      return;
    }

    if (!deletePassword) {
      res.status(400).json({ success: false, message: 'Delete warning password is required' });
      return;
    }

    if (assignedUsers && Array.isArray(assignedUsers)) {
      const users = await User.find({ _id: { $in: assignedUsers } });
      const managers = users.filter(u => u.role === 'Manager');
      const opsHeads = users.filter(u => u.role === 'Head of Operations');

      if (managers.length > 1) {
        res.status(400).json({ success: false, message: 'A project can only have one Manager assigned.' });
        return;
      }
      if (opsHeads.length > 1) {
        res.status(400).json({ success: false, message: 'A project can only have one Head of Operations assigned.' });
        return;
      }
    }

    const project = await Project.create({
      name,
      clientName,
      location,
      startDate: startDate || '',
      expectedEndDate: expectedEndDate || '',
      status: status || 'Active',
      remarks: remarks || '',
      stage: 'Planning',
      assignedUsers: assignedUsers || [],
      deletePassword,
    });

    if (assignedUsers && Array.isArray(assignedUsers)) {
      for (const uId of assignedUsers) {
        const u = await User.findById(uId);
        if (u) {
          await ProjectMember.create({
            projectId: project._id,
            userId: u._id,
            role: u.role,
          });
        }
      }

      if (assignedUsers.length > 0) {
        // AUTOMATIC NOTIFICATION: New Project Assigned
        await sendNotificationToUser({
          recipientIds: assignedUsers,
          roles: ['Admin', 'Head of Operations', 'Manager', 'Staff'],
          title: '🏗️ Project Assigned',
          message: `You have been assigned to project '${project.name}'. 🏗️`,
          category: 'Project',
          data: {
            type: 'project_assigned',
            projectId: project._id.toString(),
            projectName: project.name,
          },
        });
      }
    }

    const populatedProject = await Project.findById(project._id)
      .populate('assignedUsers', 'name username role profileImage');

    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      project: populatedProject,
    });
  } catch (error) {
    console.error('createProject error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PUT /api/projects/:id
export const updateProject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || !['Admin', 'Manager', 'Head of Operations'].includes(req.user.role || '')) {
      res.status(403).json({ success: false, message: 'Permission denied. Only Admin, Manager, and Head of Operations can update projects.' });
      return;
    }
    const { id } = req.params;
    const { name, clientName, location, startDate, expectedEndDate, status, remarks, progress, assignedUsers, deletePassword } = req.body;

    const project = await Project.findById(id);
    if (!project) {
      res.status(404).json({ success: false, message: 'Project not found' });
      return;
    }
    const oldStatus = project.status;

    const oldUserIds = (project.assignedUsers || []).map((u: any) => u.toString());
    const newlyAssignedIds: string[] = [];

    if (assignedUsers && Array.isArray(assignedUsers)) {
      assignedUsers.forEach((uId: any) => {
        if (!oldUserIds.includes(uId.toString())) {
          newlyAssignedIds.push(uId.toString());
        }
      });

      const users = await User.find({ _id: { $in: assignedUsers } });
      const managers = users.filter(u => u.role === 'Manager');
      const opsHeads = users.filter(u => u.role === 'Head of Operations');

      if (managers.length > 1) {
        res.status(400).json({ success: false, message: 'A project can only have one Manager assigned.' });
        return;
      }
      if (opsHeads.length > 1) {
        res.status(400).json({ success: false, message: 'A project can only have one Head of Operations assigned.' });
        return;
      }
      project.assignedUsers = assignedUsers;

      // Sync ProjectMember collection
      await ProjectMember.deleteMany({
        projectId: id,
        userId: { $nin: assignedUsers }
      });

      for (const uId of assignedUsers) {
        const u = users.find(userObj => userObj._id.toString() === uId.toString());
        if (u) {
          const exists = await ProjectMember.findOne({ projectId: id, userId: u._id });
          if (!exists) {
            await ProjectMember.create({
              projectId: id,
              userId: u._id,
              role: u.role
            });
          }
        }
      }
    } else if (assignedUsers === null || (Array.isArray(assignedUsers) && assignedUsers.length === 0)) {
      await ProjectMember.deleteMany({ projectId: id });
      project.assignedUsers = [];
    }

    if (name !== undefined) project.name = name;
    if (clientName !== undefined) project.clientName = clientName;
    if (location !== undefined) project.location = location;
    if (startDate !== undefined) project.startDate = startDate;
    if (expectedEndDate !== undefined) project.expectedEndDate = expectedEndDate;
    if (status !== undefined) project.status = status;
    if (remarks !== undefined) project.remarks = remarks;
    if (progress !== undefined) project.progress = progress;
    if (deletePassword !== undefined && deletePassword !== '') {
      project.deletePassword = deletePassword;
    }

    const statusChanged = status !== undefined && status !== oldStatus;
    await project.save();

    if (newlyAssignedIds.length > 0) {
      // AUTOMATIC NOTIFICATION: New Project Assigned
      await sendNotificationToUser({
        recipientIds: newlyAssignedIds,
        roles: ['Admin', 'Head of Operations', 'Manager', 'Staff'],
        title: '🏗️ Project Assigned',
        message: `You have been assigned to project '${project.name}'. 🏗️`,
        category: 'Project',
        data: {
          type: 'project_assigned',
          projectId: project._id.toString(),
          projectName: project.name,
        },
      });
    }

    const populatedProject = await Project.findById(id)
      .populate('assignedUsers', 'name username role profileImage');

    res.status(200).json({
      success: true,
      message: 'Project updated successfully',
      project: populatedProject,
    });
  } catch (error) {
    console.error('updateProject error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// DELETE /api/projects/:id
export const deleteProject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || !['Admin', 'Manager', 'Head of Operations'].includes(req.user.role || '')) {
      res.status(403).json({ success: false, message: 'Permission denied. Only Admin, Manager, and Head of Operations can delete projects.' });
      return;
    }
    const { id } = req.params;
    const { deletePassword } = req.body;
    const deletePasswordVal = deletePassword || req.headers['x-delete-password'] || req.query.deletePassword;

    if (!deletePasswordVal) {
      res.status(400).json({ success: false, message: 'Delete warning password is required to delete this project.' });
      return;
    }

    const project = await Project.findById(id).select('+deletePassword');
    if (!project) {
      res.status(404).json({ success: false, message: 'Project not found' });
      return;
    }

    const isMatch = await project.compareDeletePassword(deletePasswordVal as string);
    if (!isMatch) {
      res.status(400).json({ success: false, message: 'Incorrect delete warning password. Project not deleted.' });
      return;
    }

    // 1. Delete all project members
    await ProjectMember.deleteMany({ projectId: id });

    // 2. Find and delete all project materials and their linked quotations
    const materials = await Material.find({ projectId: id });
    const materialIds = materials.map(m => m._id);
    if (materialIds.length > 0) {
      await Quotation.deleteMany({ materialId: { $in: materialIds } });
    }
    await Material.deleteMany({ projectId: id });

    // 3. Delete purchases
    await Purchase.deleteMany({ projectId: id });

    // 4. Delete invoices
    await Invoice.deleteMany({ projectId: id });

    // 5. Delete payments
    await Payment.deleteMany({ projectId: id });

    // 6. Delete documents
    await DocumentFile.deleteMany({ projectId: id });

    // 7. Delete workflows
    await MaterialWorkflow.deleteMany({ projectId: id });

    // 8. Delete the project itself
    await Project.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Project deleted successfully',
    });
  } catch (error) {
    console.error('deleteProject error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
