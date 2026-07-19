import { Response } from 'express';
import { Project } from '../models/project.model';
import { ProjectMember } from '../models/projectMember.model';
import { User } from '../models/user.model';
import { AuthRequest } from '../middlewares/auth.middleware';

// GET /api/projects
export const getProjects = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const query: any = {};

    // Filter projects by assignment for non-Admin roles
    if (user && user.role !== 'Admin') {
      const memberships = await ProjectMember.find({ userId: user._id });
      const projectIds = memberships.map(m => m.projectId);
      query._id = { $in: projectIds };
    }

    const projects = await Project.find(query).sort({ createdAt: -1 });

    const projectsWithMembers = await Promise.all(
      projects.map(async (project) => {
        const members = await ProjectMember.find({ projectId: project._id })
          .populate('userId', 'name username role email phone profileImage employeeId department isActive');
        return {
          ...project.toObject(),
          assignedUsers: members.map(m => {
            if (m.userId) {
              const uObj = (m.userId as any).toObject ? (m.userId as any).toObject() : m.userId;
              // Override role to project-specific role
              return { ...uObj, role: m.role };
            }
            return null;
          }).filter(Boolean)
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
    const { name, clientName, location, startDate, expectedEndDate, status, remarks, assignedUsers } = req.body;

    if (!name || !clientName || !location) {
      res.status(400).json({ success: false, message: 'Name, clientName and location are required' });
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
    const { id } = req.params;
    const { name, clientName, location, startDate, expectedEndDate, status, remarks, progress, assignedUsers } = req.body;

    const project = await Project.findById(id);
    if (!project) {
      res.status(404).json({ success: false, message: 'Project not found' });
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

    await project.save();

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
    const { id } = req.params;

    const project = await Project.findById(id);
    if (!project) {
      res.status(404).json({ success: false, message: 'Project not found' });
      return;
    }

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
