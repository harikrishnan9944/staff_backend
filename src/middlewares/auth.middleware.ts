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

    const superRoles = ['Admin', 'Head of Operations', 'Manager'];
    if (!superRoles.includes(req.user.role) && !roles.includes(req.user.role)) {
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
      // Map of default permissions for the 4 roles
      const defaultRolePermissions: Record<string, string[]> = {
        'Admin': ['all'],
        'Head of Operations': [
          'all',
        ],
        'Manager': [
          'all',
        ],
        'Staff': [
          'view_dashboard',
          'view_assigned_projects',
          'view_projects',
          'select_materials',
          'view_material_details',
          'manage_purchase_orders',
          'upload_invoices',
          'update_purchase_status',
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
