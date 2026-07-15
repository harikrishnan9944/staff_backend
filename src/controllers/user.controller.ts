import { Response } from 'express';
import { User, IUser } from '../models/user.model';
import { RefreshToken } from '../models/token.model';
import { Role } from '../models/role.model';
import { AuthRequest } from '../middlewares/auth.middleware';
import bcrypt from 'bcryptjs';

// GET /api/users
// Admin only - Get all users with search, filter, and sort
export const getUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, role, status, sort } = req.query;

    const query: any = {};

    // 1. Search Query (Name, Username, Email, Phone)
    if (search) {
      const searchRegex = new RegExp(String(search), 'i');
      query.$or = [
        { name: searchRegex },
        { username: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
      ];
    }

    // 2. Filter by Role
    if (role && role !== 'All') {
      query.role = role;
    }

    // 3. Filter by Status (Active / Inactive)
    if (status && status !== 'All') {
      query.isActive = status === 'Active';
    }

    // 4. Sorting logic
    let sortOption: any = { createdAt: -1 }; // default to latest
    if (sort === 'Name') {
      sortOption = { name: 1 };
    } else if (sort === 'Oldest') {
      sortOption = { createdAt: 1 };
    } else if (sort === 'Latest') {
      sortOption = { createdAt: -1 };
    }

    const users = await User.find(query)
      .select('-password')
      .populate('createdBy', 'name username')
      .sort(sortOption);

    res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    console.error('getUsers error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/users/:id
// Admin can view any user; other roles can only read their own profile
export const getUserById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const currentUser = req.user;

    if (!currentUser) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    // Check if user is Admin or is requesting their own profile
    if (currentUser.role !== 'Admin' && currentUser._id.toString() !== id) {
      res.status(430).json({
        success: false,
        message: 'Forbidden: You are only allowed to read your own profile',
      });
      return;
    }

    const user = await User.findById(id)
      .select('-password')
      .populate('createdBy', 'name username');

    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error('getUserById error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/users
// Admin only - Create user
export const createUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, username, password, role, email, phone, profileImage, isActive } = req.body;
    const adminUser = req.user;

    // Check unique username
    const usernameExists = await User.findOne({ username });
    if (usernameExists) {
      res.status(400).json({ success: false, message: 'Username is already taken' });
      return;
    }

    // Check unique email
    const emailExists = await User.findOne({ email });
    if (emailExists) {
      res.status(400).json({ success: false, message: 'Email is already registered' });
      return;
    }

    const newUser = await User.create({
      name,
      username,
      password,
      role,
      email,
      phone,
      profileImage: profileImage || '',
      isActive: isActive !== undefined ? isActive : true,
      createdBy: adminUser?._id,
    });

    const userResponse = await User.findById(newUser._id)
      .select('-password')
      .populate('createdBy', 'name username');

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: userResponse,
    });
  } catch (error) {
    console.error('createUser error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PUT /api/users/:id
// Admin only - Update user
export const updateUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, email, phone, role, profileImage, isActive } = req.body;

    const user = await User.findById(id);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    // Check unique email if it changed
    if (email && email.toLowerCase() !== user.email.toLowerCase()) {
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        res.status(400).json({ success: false, message: 'Email is already registered by another user' });
        return;
      }
    }

    // Update fields
    if (name !== undefined) user.name = name;
    if (email !== undefined) user.email = email;
    if (phone !== undefined) user.phone = phone;
    if (role !== undefined) user.role = role;
    if (profileImage !== undefined) user.profileImage = profileImage;
    if (isActive !== undefined) {
      user.isActive = isActive;
      // If deactivating, delete all active refresh sessions for this user
      if (!isActive) {
        await RefreshToken.deleteMany({ userId: user._id });
      }
    }

    await user.save();

    const updatedUser = await User.findById(id)
      .select('-password')
      .populate('createdBy', 'name username');

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      user: updatedUser,
    });
  } catch (error) {
    console.error('updateUser error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// DELETE /api/users/:id
// Admin only - Delete user
export const deleteUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    // Prevent self deletion
    if (req.user && req.user._id.toString() === id) {
      res.status(400).json({ success: false, message: 'You cannot delete your own admin account' });
      return;
    }

    // Delete user
    await User.findByIdAndDelete(id);

    // Revoke all refresh tokens
    await RefreshToken.deleteMany({ userId: id });

    res.status(200).json({
      success: true,
      message: `User '${user.username}' deleted successfully`,
    });
  } catch (error) {
    console.error('deleteUser error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PATCH /api/users/status
// Admin only - Change user status
export const updateStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId, isActive } = req.body;

    if (!userId || isActive === undefined) {
      res.status(400).json({ success: false, message: 'userId and isActive parameters are required' });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    // Prevent deactivating oneself
    if (req.user && req.user._id.toString() === userId && !isActive) {
      res.status(400).json({ success: false, message: 'You cannot deactivate your own admin account' });
      return;
    }

    user.isActive = isActive;
    await user.save();

    if (!isActive) {
      // Expel sessions immediately
      await RefreshToken.deleteMany({ userId });
    }

    res.status(200).json({
      success: true,
      message: `User status set to ${isActive ? 'Active' : 'Inactive'} successfully`,
      user: {
        _id: user._id,
        username: user.username,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    console.error('updateStatus error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PATCH /api/users/reset-password
// Admin only - Reset other user's password
export const resetPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId, newPassword } = req.body;

    if (!userId || !newPassword) {
      res.status(400).json({ success: false, message: 'userId and newPassword are required' });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ success: false, message: 'Password must be at least 8 characters long' });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    // Set new password
    user.password = newPassword;
    await user.save();

    // Invalidate existing sessions so they are forced to log in with new password
    await RefreshToken.deleteMany({ userId });

    res.status(200).json({
      success: true,
      message: `Password reset successfully for user '${user.username}'`,
    });
  } catch (error) {
    console.error('resetPassword error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/users/permissions
// Authenticated user - Get own role and merged list of permissions
export const getUserPermissions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const roleDoc = await Role.findOne({ name: req.user.role });
    const rolePermissions = roleDoc ? roleDoc.permissions : [];

    const userPermissions = req.user.permissions || [];
    const mergedPermissions = [...new Set([...rolePermissions, ...userPermissions])];

    res.status(200).json({
      success: true,
      role: req.user.role,
      permissions: mergedPermissions,
    });
  } catch (error) {
    console.error('getUserPermissions error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
