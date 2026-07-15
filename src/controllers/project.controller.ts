import { Response } from 'express';
import { Project } from '../models/project.model';
import { AuthRequest } from '../middlewares/auth.middleware';

// GET /api/projects
export const getProjects = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const projects = await Project.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: projects.length,
      projects,
    });
  } catch (error) {
    console.error('getProjects error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/projects
export const createProject = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, clientName, location, startDate, expectedEndDate, status, remarks } = req.body;

    if (!name || !clientName || !location) {
      res.status(400).json({ success: false, message: 'Name, clientName and location are required' });
      return;
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
    });

    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      project,
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
    const { name, clientName, location, startDate, expectedEndDate, status, remarks, progress } = req.body;

    const project = await Project.findById(id);
    if (!project) {
      res.status(404).json({ success: false, message: 'Project not found' });
      return;
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

    res.status(200).json({
      success: true,
      message: 'Project updated successfully',
      project,
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
