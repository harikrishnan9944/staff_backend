import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { ProjectMember } from '../models/projectMember.model';

export const checkProjectAccess = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    // Admins have override access to all projects
    if (user.role === 'Admin') {
      next();
      return;
    }

    // Retrieve projectId from route params, query, or body
    const projectId = req.params.projectId || req.params.id || req.query.projectId || req.body.projectId;

    if (!projectId) {
      // If no project context is provided, allow the request to proceed (handled by standard controller logic)
      next();
      return;
    }

    // Verify membership mapping
    const member = await ProjectMember.findOne({
      projectId,
      userId: user._id,
    });

    if (!member) {
      res.status(403).json({
        success: false,
        message: 'Access Denied: You are not assigned to this construction project.',
      });
      return;
    }

    // Store membership info in request context for convenience if needed
    (req as any).projectRole = member.role;

    next();
  } catch (error) {
    console.error('Project access check error:', error);
    res.status(500).json({ success: false, message: 'Internal authorization error' });
  }
};
