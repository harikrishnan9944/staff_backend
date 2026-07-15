import { Response } from 'express';
import { Purchase } from '../models/purchase.model';
import { Material } from '../models/material.model';
import { Payment } from '../models/payment.model';
import { Project } from '../models/project.model';
import { ReportExport } from '../models/report.model';
import { Activity } from '../models/activity.model';
import { AuthRequest } from '../middlewares/auth.middleware';

// GET /api/reports/analytics
// Aggregated data for dashboard charts and reports
export const getAnalyticsData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // 1. Projects by Status Distribution
    const activeCount = await Project.countDocuments({ status: 'Active' });
    const completedCount = await Project.countDocuments({ status: 'Completed' });
    const suspendedCount = await Project.countDocuments({ status: 'Suspended' });

    const projectsByStatus = [
      { label: 'Active', value: activeCount, color: '#3b82f6' },
      { label: 'Completed', value: completedCount, color: '#10b981' },
      { label: 'Suspended', value: suspendedCount, color: '#ef4444' },
    ];

    // 2. Purchases and Payments over the last 6 months
    const months = [];
    const purchaseSeries = [];
    const paymentSeries = [];
    const date = new Date();

    for (let i = 5; i >= 0; i--) {
      const d = new Date(date.getFullYear(), date.getMonth() - i, 1);
      const startOfMonth = new Date(d.getFullYear(), d.getMonth(), 1);
      const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

      const monthName = d.toLocaleString('default', { month: 'short' });
      months.push(monthName);

      // Total PO Amount
      const purchases = await Purchase.find({
        createdAt: { $gte: startOfMonth, $lte: endOfMonth },
        status: { $nin: ['Draft', 'Cancelled'] },
      });
      const poTotal = purchases.reduce((sum, p) => sum + p.finalAmount, 0);
      purchaseSeries.push(poTotal);

      // Total Paid Amount
      const payments = await Payment.find({
        paymentDate: { $gte: startOfMonth, $lte: endOfMonth },
        status: 'Completed',
      });
      const payTotal = payments.reduce((sum, pay) => sum + pay.amount, 0);
      paymentSeries.push(payTotal);
    }

    const purchaseSummary = {
      labels: months,
      datasets: [
        { label: 'Purchase Orders', data: purchaseSeries, color: '#0f172a' }, // Navy
        { label: 'Payments Released', data: paymentSeries, color: '#f97316' }, // Orange
      ],
    };

    // 3. Material category consumption ratios
    const materials = await Material.find({ status: 'Completed' });
    const consumptionMap: Record<string, number> = {};
    let totalSpent = 0;

    for (const m of materials) {
      const cost = m.quantity * m.estimatedCost;
      totalSpent += cost;
      consumptionMap[m.materialName] = (consumptionMap[m.materialName] || 0) + cost;
    }

    const materialUsage = Object.entries(consumptionMap)
      .map(([name, cost]) => {
        const percentage = totalSpent > 0 ? Math.round((cost / totalSpent) * 100) : 0;
        return {
          name,
          percentage,
          quantity: `${cost} USD equivalents`,
        };
      })
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 5); // top 5 materials

    res.status(200).json({
      success: true,
      projectsByStatus,
      purchaseSummary,
      materialUsage,
    });
  } catch (error) {
    console.error('getAnalyticsData error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/reports/export
// Trigger a mock file generation for PDF/CSV report exports
export const exportReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { reportType, format, startDate, endDate } = req.body;
    const user = req.user;

    if (!reportType || !format || !startDate || !endDate) {
      res.status(400).json({ success: false, message: 'Required fields are missing' });
      return;
    }

    // Dynamic Mock download url generation based on report metadata
    // In production, we'd compile CSV strings or PDF streams and save to Cloudinary
    const mockFilename = `${reportType.toLowerCase()}_report_${Date.now()}.${format.toLowerCase()}`;
    const fileUrl = `https://storage.googleapis.com/construction_mock_reports/${mockFilename}`;

    const report = await ReportExport.create({
      reportType,
      format,
      dateRange: {
        start: new Date(startDate),
        end: new Date(endDate),
      },
      generatedBy: user?._id,
      fileUrl,
    });

    await Activity.create({
      user: user?._id,
      action: `Generated and exported ${reportType} Report in ${format} format`,
      module: 'Settings',
    });

    res.status(201).json({
      success: true,
      message: `${reportType} Report generated successfully. Ready for download.`,
      report,
    });
  } catch (error) {
    console.error('exportReport error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/reports/history
// List historical generated exports
export const getExportHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const history = await ReportExport.find()
      .populate('generatedBy', 'name username role')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: history.length,
      history,
    });
  } catch (error) {
    console.error('getExportHistory error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
