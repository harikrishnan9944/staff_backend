import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { User, IUser } from '../models/user.model';

export interface AuthRequest extends Request {
  user?: IUser;
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'Authorization token required' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_ACCESS_SECRET || 'super_secret_access_key_123!@#';

    let decoded: any;
    try {
      decoded = jwt.verify(token, secret);
    } catch (err: any) {
      if (err.name === 'TokenExpiredError') {
        res.status(401).json({ success: false, message: 'Token expired', code: 'TOKEN_EXPIRED' });
        return;
      }
      res.status(401).json({ success: false, message: 'Invalid token' });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(decoded.id)) {
      res.status(401).json({ success: false, message: 'Invalid token structure' });
      return;
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      res.status(401).json({ success: false, message: 'User not found' });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ success: false, message: 'User account is inactive', code: 'USER_INACTIVE' });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const authorize = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(430).json({
        success: false,
        message: `Forbidden: Role '${req.user.role}' is not authorized to access this resource`,
      });
      return;
    }

    next();
  };
};

export const requirePermissions = (requiredPermissions: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    try {
      // Map of default permissions for the 6 roles + Admin
      const defaultRolePermissions: Record<string, string[]> = {
        'Admin': ['all'],
        'Architect': [
          'view_dashboard',
          'view_assigned_projects',
          'select_materials',
          'view_material_details',
          'create_comments',
          'view_profile',
        ],
        'Head of Operations': [
          'view_dashboard',
          'view_projects',
          'select_materials',
          'manage_quotations',
          'approve_workflow',
          'view_reports',
          'view_profile',
        ],
        'Manager': [
          'view_dashboard',
          'view_projects',
          'manage_materials',
          'manage_quotations',
          'manage_workflow',
          'create_comments',
          'view_reports',
          'view_profile',
        ],
        'Supervisor': [
          'view_dashboard',
          'view_assigned_projects',
          'select_materials',
          'update_progress',
          'create_comments',
          'upload_site_photos',
          'view_profile',
        ],
        'Purchase Supervisor': [
          'view_dashboard',
          'view_projects',
          'manage_purchase_orders',
          'view_vendors',
          'upload_invoices',
          'update_purchase_status',
          'view_profile',
        ],
        'Accountant': [
          'view_dashboard',
          'view_invoices',
          'view_payment_status',
          'view_reports',
          'download_bills',
          'view_profile',
        ],
      };

      const rolePermissions = defaultRolePermissions[req.user.role] || [];

      // Merge role default permissions and user custom permissions
      const userPermissions = req.user.permissions || [];
      const mergedPermissions = [...new Set([...rolePermissions, ...userPermissions])];

      // If user has 'all' permission (e.g. Admin), grant access
      if (mergedPermissions.includes('all')) {
        return next();
      }

      // Check if user has all required permissions
      const hasAllRequired = requiredPermissions.every((perm) => mergedPermissions.includes(perm));
      if (!hasAllRequired) {
        res.status(403).json({
          success: false,
          message: 'Forbidden: You do not have the required permissions for this action',
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  };
};
