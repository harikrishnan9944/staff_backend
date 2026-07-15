import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';

// GET /health
// System diagnostics and API monitoring check
export const checkHealth = async (req: Request, res: Response): Promise<void> => {
  try {
    // 1. Verify Mongoose DB state
    const dbState = mongoose.connection.readyState;
    let dbStatus = 'Disconnected';
    if (dbState === 1) dbStatus = 'Connected';
    else if (dbState === 2) dbStatus = 'Connecting';
    else if (dbState === 3) dbStatus = 'Disconnecting';

    // 2. Check Cloudinary settings load
    const cloudinaryConfigured = !!cloudinary.config().cloud_name;

    const healthy = dbState === 1 && cloudinaryConfigured;

    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'Healthy' : 'Degraded',
      timestamp: new Date(),
      version: '1.2.0-production',
      services: {
        database: {
          status: dbStatus,
          readyState: dbState,
        },
        cloudinary: {
          status: cloudinaryConfigured ? 'Configured' : 'Missing Credentials',
        },
        server: {
          status: 'Up',
          uptime: process.uptime(),
        },
      },
    });
  } catch (error: any) {
    console.error('System Health check failed:', error);
    res.status(500).json({
      status: 'Unhealthy',
      timestamp: new Date(),
      error: error.message || 'Internal check error',
    });
  }
};
