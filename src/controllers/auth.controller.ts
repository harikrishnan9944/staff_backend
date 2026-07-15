import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { User, IUser } from '../models/user.model';
import { RefreshToken } from '../models/token.model';
import { AuthRequest } from '../middlewares/auth.middleware';

// Helper to map role to specific permissions
const getPermissionsByRole = (role: IUser['role']): string[] => {
  switch (role) {
    case 'Admin':
      return ['all'];
    case 'Architect':
      return ['view_dashboard', 'manage_blueprints', 'view_projects'];
    case 'Head of Operations':
      return ['view_dashboard', 'manage_operations', 'view_all_projects'];
    case 'Manager':
      return ['view_dashboard', 'manage_staff', 'manage_projects'];
    case 'Supervisor':
      return ['view_dashboard', 'manage_daily_logs', 'view_assigned_projects'];
    case 'Purchase Supervisor':
      return ['view_dashboard', 'manage_procurement', 'approve_materials'];
    case 'Accountant':
      return ['view_dashboard', 'manage_expenses', 'view_financials'];
    default:
      return [];
  }
};

// JWT helper functions
const generateAccessToken = (user: IUser): string => {
  const secret = process.env.JWT_ACCESS_SECRET || 'super_secret_access_key_123!@#';
  const expiresIn = process.env.JWT_ACCESS_EXPIRE || '15m';
  return jwt.sign({ id: user._id, role: user.role }, secret, { expiresIn: expiresIn as any });
};

const generateRefreshToken = (user: IUser): string => {
  const secret = process.env.JWT_REFRESH_SECRET || 'super_secret_refresh_key_456!@#';
  const expiresIn = process.env.JWT_REFRESH_EXPIRE || '7d';
  return jwt.sign({ id: user._id }, secret, { expiresIn: expiresIn as any });
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;

    // Find user
    const user = await User.findOne({ username });
    if (!user) {
      res.status(401).json({ success: false, message: 'Invalid username or password' });
      return;
    }

    // Check if active
    if (!user.isActive) {
      res.status(403).json({ success: false, message: 'Your account is inactive. Please contact an admin.' });
      return;
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      res.status(401).json({ success: false, message: 'Invalid username or password' });
      return;
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Save refresh token in DB
    const refreshSecret = process.env.JWT_REFRESH_SECRET || 'super_secret_refresh_key_456!@#';
    const decoded = jwt.verify(refreshToken, refreshSecret) as { exp: number };
    const expiresAt = new Date(decoded.exp * 1000);

    await RefreshToken.create({
      userId: user._id,
      token: refreshToken,
      expiresAt,
    });

    // Update last login timestamp
    user.lastLogin = new Date();
    await user.save();

    // Strip password from user object
    const userResponse = {
      _id: user._id,
      name: user.name,
      username: user.username,
      role: user.role,
      email: user.email,
      phone: user.phone,
      profileImage: user.profileImage,
      isActive: user.isActive,
      lastLogin: user.lastLogin,
      employeeId: user.employeeId,
      department: user.department,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    res.status(200).json({
      success: true,
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: userResponse,
      role: user.role,
      permissions: getPermissionsByRole(user.role),
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'An internal server error occurred' });
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ success: false, message: 'Refresh token is required for logging out' });
      return;
    }

    // Revoke token from DB
    await RefreshToken.deleteOne({ token: refreshToken });

    res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, message: 'An internal server error occurred' });
  }
};

export const refresh = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ success: false, message: 'Refresh token is required' });
      return;
    }

    // Verify token exists in database
    const savedToken = await RefreshToken.findOne({ token: refreshToken });
    if (!savedToken) {
      res.status(401).json({ success: false, message: 'Invalid or revoked refresh token' });
      return;
    }

    const refreshSecret = process.env.JWT_REFRESH_SECRET || 'super_secret_refresh_key_456!@#';
    
    let decoded: any;
    try {
      decoded = jwt.verify(refreshToken, refreshSecret);
    } catch (err) {
      // Token is invalid or expired, delete from DB
      await RefreshToken.deleteOne({ token: refreshToken });
      res.status(401).json({ success: false, message: 'Expired or invalid refresh token' });
      return;
    }

    // Fetch user details
    if (!mongoose.Types.ObjectId.isValid(decoded.id)) {
      await RefreshToken.deleteOne({ token: refreshToken });
      res.status(401).json({ success: false, message: 'Invalid token structure' });
      return;
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      await RefreshToken.deleteOne({ token: refreshToken });
      res.status(401).json({ success: false, message: 'User not found' });
      return;
    }

    if (!user.isActive) {
      await RefreshToken.deleteOne({ token: refreshToken });
      res.status(403).json({ success: false, message: 'User account is inactive' });
      return;
    }

    // Implement Refresh Token Rotation (RTR)
    await RefreshToken.deleteOne({ token: refreshToken });

    // Generate new set of tokens
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    // Save new refresh token in DB
    const newDecoded = jwt.verify(newRefreshToken, refreshSecret) as { exp: number };
    const expiresAt = new Date(newDecoded.exp * 1000);

    await RefreshToken.create({
      userId: user._id,
      token: newRefreshToken,
      expiresAt,
    });

    const userResponse = {
      _id: user._id,
      name: user.name,
      username: user.username,
      role: user.role,
      email: user.email,
      phone: user.phone,
      profileImage: user.profileImage,
      isActive: user.isActive,
      employeeId: user.employeeId,
      department: user.department,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    res.status(200).json({
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: userResponse,
      role: user.role,
      permissions: getPermissionsByRole(user.role),
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ success: false, message: 'An internal server error occurred' });
  }
};

export const me = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    // Strip password
    const userResponse = {
      _id: req.user._id,
      name: req.user.name,
      username: req.user.username,
      role: req.user.role,
      email: req.user.email,
      phone: req.user.phone,
      profileImage: req.user.profileImage,
      isActive: req.user.isActive,
      employeeId: req.user.employeeId,
      department: req.user.department,
      createdAt: req.user.createdAt,
      updatedAt: req.user.updatedAt,
    };

    res.status(200).json({
      success: true,
      user: userResponse,
      role: req.user.role,
      permissions: getPermissionsByRole(req.user.role),
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, message: 'An internal server error occurred' });
  }
};

export const changePassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    // Compare with old password
    const isMatch = await req.user.comparePassword(oldPassword);
    if (!isMatch) {
      res.status(400).json({ success: false, message: 'Incorrect old password' });
      return;
    }

    // Update password
    req.user.password = newPassword;
    await req.user.save();

    res.status(200).json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'An internal server error occurred' });
  }
};
