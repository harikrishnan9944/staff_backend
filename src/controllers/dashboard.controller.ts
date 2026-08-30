import { Response } from 'express';
import { Project } from '../models/project.model';
import { AuthRequest } from '../middlewares/auth.middleware';
import { Purchase } from '../models/purchase.model';
import { ProjectMember } from '../models/projectMember.model';
import { Notification } from '../models/notification.model';

// Helper to filter projects query by role assignment
const getProjectQueryByRole = async (userId: string, role: string) => {
  const isAdminOrOperations = ['Admin', 'Head of Operations', 'Manager'].includes(role);
  if (isAdminOrOperations) return {};
  const memberships = await ProjectMember.find({ userId }).select('projectId').lean();
  const projectIds = memberships.map(m => m.projectId);
  return { _id: { $in: projectIds } };
};

// GET /api/dashboard/summary
// Authenticated user - Retrieve customized metrics, projects, and activities
export const getDashboardSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const userId = user._id.toString();
    const role = user.role;

    const projectQuery = await getProjectQueryByRole(userId, role);

    // Parallelize all metrics and project list queries
    const [
      totalProjects,
      activeProjects,
      completedProjects,
      pendingPurchases,
      recentProjects
    ] = await Promise.all([
      Project.countDocuments(projectQuery),
      Project.countDocuments({ ...projectQuery, status: 'Active' }),
      Project.countDocuments({ ...projectQuery, status: 'Completed' }),
      Purchase.countDocuments({ status: 'Approved', paymentStatus: 'Pending' }),
      Project.find(projectQuery)
        .populate('assignedUsers', 'name username profileImage role')
        .sort({ updatedAt: -1 })
        .limit(5)
        .lean()
    ]);

    // Workflow metrics
    const workflowMetrics = {
      pendingMaterials: 6,
      pendingQuotations: 4,
      pendingPurchases: pendingPurchases || 5,
      invoicesPending: 7,
      completedPurchases: 14,
    };

    // Static mock recent activities (removes Activity database dependency)
    const recentActivities = [
      { 
        _id: 'act1', 
        user: { name: 'System Administrator', role: 'Admin' }, 
        action: 'Created project Nila Villa Development', 
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString() 
      },
      { 
        _id: 'act2', 
        user: { name: 'Marcus Stone', role: 'Architect' }, 
        action: 'Selected Black Galaxy Granite Slab', 
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString() 
      },
    ];

    res.status(200).json({
      success: true,
      role,
      summary: {
        totalProjects,
        activeProjects,
        completedProjects,
        myTasksCount: pendingPurchases || 1,
        ...workflowMetrics,
      },
      recentProjects,
      recentActivities,
      myTasks: [],
    });
  } catch (error) {
    console.error('getDashboardSummary error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/dashboard/analytics
// Authenticated user - Get chart details
export const getAnalyticsData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const projectQuery = await getProjectQueryByRole(user._id.toString(), user.role);

    // Parallel count distribution
    const [active, completed, suspended] = await Promise.all([
      Project.countDocuments({ ...projectQuery, status: 'Active' }),
      Project.countDocuments({ ...projectQuery, status: 'Completed' }),
      Project.countDocuments({ ...projectQuery, status: 'Suspended' }),
    ]);

    const projectsByStatus = [
      { label: 'Active', value: active || 5, color: '#0f172a' },
      { label: 'Completed', value: completed || 3, color: '#10b981' },
      { label: 'Suspended', value: suspended || 1, color: '#f97316' },
    ];

    const purchaseSummary = {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
      datasets: [
        { label: 'Approved Purchases', data: [15000, 24000, 18000, 32000, 28000, 42000], color: '#0f172a' },
        { label: 'Pending Invoices', data: [5000, 9000, 12000, 8000, 15000, 11000], color: '#f97316' },
      ],
    };

    const materialUsage = [
      { name: 'Concrete', percentage: 45, quantity: '120m³' },
      { name: 'Steel', percentage: 25, quantity: '18 Tons' },
      { name: 'Brick & Blocks', percentage: 15, quantity: '8,500 Pcs' },
      { name: 'Electrical & Cabling', percentage: 10, quantity: '1,200m' },
      { name: 'Wood & Framing', percentage: 5, quantity: '350 Pcs' },
    ];

    const monthlyActivities = {
      labels: ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      data: [65, 82, 74, 98, 110, 135],
    };

    const weeklyProgress = {
      labels: ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4', 'Wk 5'],
      data: [20, 35, 50, 72, 85],
    };

    res.status(200).json({
      success: true,
      projectsByStatus,
      purchaseSummary,
      materialUsage,
      monthlyActivities,
      weeklyProgress,
    });
  } catch (error) {
    console.error('getAnalyticsData error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/dashboard/notifications
// Authenticated user - Retrieve personalized alerts from database
export const getNotifications = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ userId: user._id })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      Notification.countDocuments({ userId: user._id, read: false })
    ]);

    res.status(200).json({
      success: true,
      notifications,
      unreadCount,
    });
  } catch (error) {
    console.error('getNotifications error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
