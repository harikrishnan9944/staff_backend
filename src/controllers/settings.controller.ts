import { Response } from 'express';
import { CompanySettings } from '../models/settings.model';
import { Activity } from '../models/activity.model';
import { AuthRequest } from '../middlewares/auth.middleware';

// GET /api/settings
// Retrieve active company configuration settings
export const getSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    let settings = await CompanySettings.findOne();

    // Seed default settings on the fly if not initialized
    if (!settings) {
      settings = await CompanySettings.create({
        companyName: 'Nila Construction Group Ltd',
        address: '128 Wacker Drive, Chicago, IL, USA',
        phone: '+1 555-0199',
        email: 'info@nilagroup.com',
        website: 'www.nilagroup.com',
        gstNumber: 'GST-US-202611A',
        panNumber: 'PAN-US-55443B',
        currency: 'USD',
        language: 'en',
        timezone: 'UTC-5',
        workingHours: '08:00 - 17:00',
        businessDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      });
    }

    res.status(200).json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error('getSettings error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PUT /api/settings
// Update settings configuration details (Admin only)
export const updateSettings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      companyName,
      companyLogo,
      address,
      phone,
      email,
      website,
      gstNumber,
      panNumber,
      currency,
      language,
      timezone,
      workingHours,
      businessDays,
    } = req.body;
    const user = req.user;

    let settings = await CompanySettings.findOne();
    if (!settings) {
      settings = new CompanySettings();
    }

    if (companyName) settings.companyName = companyName;
    if (companyLogo !== undefined) settings.companyLogo = companyLogo;
    if (address) settings.address = address;
    if (phone) settings.phone = phone;
    if (email) settings.email = email;
    if (website !== undefined) settings.website = website;
    if (gstNumber) settings.gstNumber = gstNumber;
    if (panNumber) settings.panNumber = panNumber;
    if (currency) settings.currency = currency;
    if (language) settings.language = language;
    if (timezone) settings.timezone = timezone;
    if (workingHours) settings.workingHours = workingHours;
    if (businessDays) settings.businessDays = businessDays;

    await settings.save();

    await Activity.create({
      user: user?._id,
      action: 'Updated system-wide Company Settings profile',
      module: 'Settings',
    });

    res.status(200).json({
      success: true,
      message: 'Company settings updated successfully',
      settings,
    });
  } catch (error) {
    console.error('updateSettings error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
