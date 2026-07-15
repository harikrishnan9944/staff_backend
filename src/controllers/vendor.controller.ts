import { Request, Response } from 'express';
import { Vendor } from '../models/vendor.model';
import { Purchase } from '../models/purchase.model';
import { Activity } from '../models/activity.model';
import { AuthRequest } from '../middlewares/auth.middleware';

// GET /api/vendors
// Authenticated user - Retrieve list of vendors with search and filters
export const getVendors = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, category, status, sort } = req.query;

    const query: any = {};

    // 1. Search (Name, phone, email, primary contact)
    if (search) {
      const searchRegex = new RegExp(String(search), 'i');
      query.$or = [
        { name: searchRegex },
        { phone: searchRegex },
        { email: searchRegex },
        { primaryContact: searchRegex },
      ];
    }

    // 2. Filters
    if (category && category !== 'All') {
      query.category = category;
    }
    if (status && status !== 'All') {
      query.status = status;
    }

    // 3. Sorting
    let sortOption: any = { name: 1 };
    if (sort === 'Oldest') {
      sortOption = { createdAt: 1 };
    } else if (sort === 'Latest') {
      sortOption = { createdAt: -1 };
    } else if (sort === 'Rating') {
      sortOption = { rating: -1 };
    } else if (sort === 'Highest Purchase') {
      sortOption = { totalPurchaseAmount: -1 };
    }

    const vendors = await Vendor.find(query)
      .populate('createdBy', 'name username')
      .sort(sortOption);

    res.status(200).json({
      success: true,
      count: vendors.length,
      vendors,
    });
  } catch (error) {
    console.error('getVendors error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/vendors/:id
// Authenticated user - Retrieve vendor details and linked purchases
export const getVendorById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const vendor = await Vendor.findById(id).populate('createdBy', 'name username');
    if (!vendor) {
      res.status(404).json({ success: false, message: 'Vendor not found' });
      return;
    }

    // Fetch previous purchases
    const purchases = await Purchase.find({ vendorId: id })
      .populate('projectId', 'name')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      vendor,
      purchases,
    });
  } catch (error) {
    console.error('getVendorById error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/vendors
// Purchase Supervisor, Manager & Admin only - Add a Vendor
export const createVendor = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      name,
      category,
      address,
      phone,
      email,
      gstNumber,
      panNumber,
      bankDetails,
      primaryContact,
      rating,
      profileImage,
      remarks,
    } = req.body;
    const user = req.user;

    if (!name || !address || !phone || !email || !gstNumber || !panNumber || !bankDetails || !primaryContact) {
      res.status(400).json({ success: false, message: 'Required fields are missing' });
      return;
    }

    const vendorExists = await Vendor.findOne({ name });
    if (vendorExists) {
      res.status(400).json({ success: false, message: 'Vendor name already exists' });
      return;
    }

    const vendor = await Vendor.create({
      name,
      category: category || 'General',
      address,
      phone,
      email,
      gstNumber,
      panNumber,
      bankDetails,
      primaryContact,
      rating: rating || 5,
      status: 'Active',
      profileImage: profileImage || '',
      remarks,
      createdBy: user?._id,
    });

    await Activity.create({
      user: user?._id,
      action: `Created Vendor profile for '${name}'`,
    });

    res.status(201).json({
      success: true,
      message: `Vendor '${name}' registered successfully`,
      vendor,
    });
  } catch (error) {
    console.error('createVendor error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PUT /api/vendors/:id
// Purchase Supervisor, Manager & Admin only - Edit Vendor
export const updateVendor = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      name,
      category,
      address,
      phone,
      email,
      gstNumber,
      panNumber,
      bankDetails,
      primaryContact,
      rating,
      status,
      profileImage,
      remarks,
    } = req.body;
    const user = req.user;

    const vendor = await Vendor.findById(id);
    if (!vendor) {
      res.status(404).json({ success: false, message: 'Vendor not found' });
      return;
    }

    if (name && name !== vendor.name) {
      const nameExists = await Vendor.findOne({ name });
      if (nameExists) {
        res.status(400).json({ success: false, message: 'Vendor name already exists' });
        return;
      }
      vendor.name = name;
    }

    if (category) vendor.category = category;
    if (address) vendor.address = address;
    if (phone) vendor.phone = phone;
    if (email) vendor.email = email;
    if (gstNumber) vendor.gstNumber = gstNumber;
    if (panNumber) vendor.panNumber = panNumber;
    if (bankDetails) vendor.bankDetails = bankDetails;
    if (primaryContact) vendor.primaryContact = primaryContact;
    if (rating !== undefined) vendor.rating = rating;
    if (status) vendor.status = status;
    if (profileImage !== undefined) vendor.profileImage = profileImage;
    if (remarks !== undefined) vendor.remarks = remarks;

    await vendor.save();

    await Activity.create({
      user: user?._id,
      action: `Updated Vendor details for '${vendor.name}'`,
    });

    res.status(200).json({
      success: true,
      message: 'Vendor details updated successfully',
      vendor,
    });
  } catch (error) {
    console.error('updateVendor error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// DELETE /api/vendors/:id
// Admin only - Delete vendor
export const deleteVendor = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const vendor = await Vendor.findById(id);
    if (!vendor) {
      res.status(404).json({ success: false, message: 'Vendor not found' });
      return;
    }

    // Check if vendor has active purchase orders before deleting
    const activePurchase = await Purchase.findOne({ vendorId: id, status: { $ne: 'Cancelled' } });
    if (activePurchase) {
      res.status(400).json({
        success: false,
        message: 'Cannot delete vendor: Active purchase orders are associated with this vendor',
      });
      return;
    }

    await Vendor.findByIdAndDelete(id);

    await Activity.create({
      user: req.user?._id,
      action: `Deleted Vendor profile '${vendor.name}'`,
    });

    res.status(200).json({
      success: true,
      message: `Vendor '${vendor.name}' deleted successfully`,
    });
  } catch (error) {
    console.error('deleteVendor error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
