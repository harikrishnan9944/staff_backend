import { Response } from 'express';
import { User, IUser } from '../models/user.model';
import { RefreshToken } from '../models/token.model';
import { Role } from '../models/role.model';
import { ProjectMember } from '../models/projectMember.model';
import { Project } from '../models/project.model';
import { AuditLog } from '../models/auditLog.model';
import { LoginHistory } from '../models/loginHistory.model';
import { AuthRequest } from '../middlewares/auth.middleware';
import { sendNotificationToUser } from '../services/notification.service';
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
    const { 
      name, 
      username, 
      password, 
      role, 
      email, 
      phone, 
      profileImage, 
      isActive, 
      employeeId, 
      department, 
      joiningDate, 
      remarks 
    } = req.body;
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

    // Check unique employee ID if provided
    if (employeeId) {
      const empExists = await User.findOne({ employeeId });
      if (empExists) {
        res.status(400).json({ success: false, message: 'Employee ID is already registered' });
        return;
      }
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
      employeeId: employeeId ? employeeId.trim() : undefined,
      department,
      joiningDate: joiningDate ? new Date(joiningDate) : undefined,
      remarks: remarks || '',
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
    const { 
      name, 
      email, 
      phone, 
      role, 
      profileImage, 
      isActive, 
      employeeId, 
      department, 
      joiningDate, 
      remarks, 
      password 
    } = req.body;

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

    // Check unique employeeId if it changed
    if (employeeId && employeeId.trim() !== user.employeeId) {
      const empExists = await User.findOne({ employeeId: employeeId.trim() });
      if (empExists) {
        res.status(400).json({ success: false, message: 'Employee ID is already registered by another user' });
        return;
      }
    }

    // Update fields
    if (name !== undefined) user.name = name;
    if (email !== undefined) user.email = email;
    if (phone !== undefined) user.phone = phone;
    if (role !== undefined) user.role = role;
    if (profileImage !== undefined) user.profileImage = profileImage;
    if (department !== undefined) user.department = department;
    if (joiningDate !== undefined) user.joiningDate = joiningDate ? new Date(joiningDate) : undefined;
    if (remarks !== undefined) user.remarks = remarks;
    if (employeeId !== undefined) user.employeeId = employeeId ? employeeId.trim() : undefined;

    if (password) {
      user.password = password; // Will be hashed by pre-save hook
    }

    if (isActive !== undefined) {
      user.isActive = isActive;
      if (!isActive) {
        await RefreshToken.deleteMany({ userId: user._id });
      }
    }

    await user.save();

    // AUTOMATIC NOTIFICATION: Important admin account update
    await sendNotificationToUser({
      recipientIds: [user._id],
      title: 'Account Details Updated',
      message: `Your account details / permissions have been updated by Administrator.`,
      category: 'System',
      data: {
        type: 'admin_update',
        userId: user._id.toString(),
      },
    });

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

// POST /api/users/assign
export const assignProjectStaff = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId, userId, role, confirmOverride } = req.body;

    if (!projectId || !userId || !role) {
      res.status(400).json({ success: false, message: 'projectId, userId and role are required' });
      return;
    }

    // Check if target user exists
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    // Validate unique role constraint: Operation Head & Project Manager
    if (['Operation Head', 'Project Manager'].includes(role)) {
      const existingAssignment = await ProjectMember.findOne({ projectId, role })
        .populate('userId', 'name username');

      if (existingAssignment) {
        const assignedUser = existingAssignment.userId as any;
        if (assignedUser._id.toString() === userId.toString()) {
          res.status(200).json({ success: true, message: 'User already assigned to this role' });
          return;
        }

        if (!confirmOverride) {
          res.status(409).json({
            success: false,
            code: 'ROLE_ALREADY_ASSIGNED',
            message: `Role '${role}' is already assigned to '${assignedUser.name}'. Do you want to replace them?`,
            existingUser: assignedUser
          });
          return;
        }

        await ProjectMember.findByIdAndDelete(existingAssignment._id);

        // Check if the replaced user has other roles in this project
        const otherAssignments = await ProjectMember.findOne({ projectId, userId: assignedUser._id });
        if (!otherAssignments) {
          await Project.findByIdAndUpdate(projectId, {
            $pull: { assignedUsers: assignedUser._id }
          });
        }

        await AuditLog.create({
          performedBy: req.user!._id,
          action: 'REMOVE_ROLE',
          projectId,
          targetUserId: assignedUser._id,
          details: `Replaced '${assignedUser.name}' with '${targetUser.name}' as '${role}'`
        });
      }
    }

    const newMember = await ProjectMember.findOneAndUpdate(
      { projectId, userId, role },
      { projectId, userId, role },
      { upsert: true, new: true }
    );

    // Sync Project.assignedUsers
    await Project.findByIdAndUpdate(projectId, {
      $addToSet: { assignedUsers: userId }
    });

    await AuditLog.create({
      performedBy: req.user!._id,
      action: 'ASSIGN_ROLE',
      projectId,
      targetUserId: userId,
      details: `Assigned user '${targetUser.name}' to project role '${role}'`
    });

    const targetProject = await Project.findById(projectId);
    const projectName = targetProject ? targetProject.name : 'Project';

    // AUTOMATIC NOTIFICATION: Project Assigned to User
    await sendNotificationToUser({
      recipientIds: [userId],
      roles: ['Admin', 'Head of Operations', 'Manager', 'Staff'],
      title: '📋 Project & Task Assignment',
      message: `⭐ Staff member '${targetUser.name}' was assigned to project "${projectName}" as ${role}. Let's build something awesome!`,
      category: 'Project',
      data: {
        type: 'project_assigned',
        projectId: projectId.toString(),
        targetUserId: userId.toString(),
        role,
      },
    });

    res.status(200).json({
      success: true,
      message: `Successfully assigned '${targetUser.name}' as '${role}'`,
      member: newMember
    });
  } catch (error) {
    console.error('assignProjectStaff error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/users/remove-assignment
export const removeProjectStaff = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId, userId, role } = req.body;

    if (!projectId || !userId || !role) {
      res.status(400).json({ success: false, message: 'projectId, userId and role are required' });
      return;
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    const deleted = await ProjectMember.findOneAndDelete({ projectId, userId, role });
    if (!deleted) {
      res.status(404).json({ success: false, message: 'Assignment not found' });
      return;
    }

    // Sync Project.assignedUsers: check if user has other assignments in the project
    const otherAssignments = await ProjectMember.findOne({ projectId, userId });
    if (!otherAssignments) {
      await Project.findByIdAndUpdate(projectId, {
        $pull: { assignedUsers: userId }
      });
    }

    await AuditLog.create({
      performedBy: req.user!._id,
      action: 'REMOVE_ROLE',
      projectId,
      targetUserId: userId,
      details: `Removed user '${targetUser.name}' from project role '${role}'`
    });

    res.status(200).json({
      success: true,
      message: `Successfully removed '${targetUser.name}' from '${role}'`
    });
  } catch (error) {
    console.error('removeProjectStaff error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/users/project/:projectId
export const getProjectStaff = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    const members = await ProjectMember.find({ projectId })
      .populate('userId', 'name username role email phone profileImage employeeId department isActive');

    res.status(200).json({
      success: true,
      count: members.length,
      members
    });
  } catch (error) {
    console.error('getProjectStaff error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/users/audit-logs
export const getAuditLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const logs = await AuditLog.find({})
      .populate('performedBy', 'name username')
      .populate('targetUserId', 'name username')
      .populate('projectId', 'name')
      .sort({ createdAt: -1 })
      .limit(100);

    res.status(200).json({
      success: true,
      count: logs.length,
      logs
    });
  } catch (error) {
    console.error('getAuditLogs error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/users/login-history
export const getLoginHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const history = await LoginHistory.find({})
      .populate('userId', 'name username role email employeeId')
      .sort({ timestamp: -1 })
      .limit(100);

    res.status(200).json({
      success: true,
      count: history.length,
      history
    });
  } catch (error) {
    console.error('getLoginHistory error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/users/push-token
export const updatePushToken = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const { pushToken } = req.body;

    if (!user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    if (!pushToken || typeof pushToken !== 'string') {
      res.status(400).json({ success: false, message: 'pushToken is required' });
      return;
    }

    const tokenClean = pushToken.trim();
    const dbUser = await User.findById(user._id);
    if (!dbUser) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    dbUser.pushToken = tokenClean;
    if (!dbUser.pushTokens) {
      dbUser.pushTokens = [];
    }
    if (!dbUser.pushTokens.includes(tokenClean)) {
      dbUser.pushTokens.push(tokenClean);
    }

    await dbUser.save();
    console.log(`[PushToken] Registered token for user '${dbUser.username}' (${dbUser.name}): ${tokenClean}`);

    res.status(200).json({
      success: true,
      message: 'Push token registered successfully',
      pushToken: tokenClean,
    });
  } catch (error) {
    console.error('updatePushToken error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

