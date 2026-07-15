import { Schema, model, Document, Types } from 'mongoose';

export interface IVendor extends Document {
  name: string;
  category: 'Masonry' | 'Plumbing' | 'Electrical' | 'Wood & Framing' | 'Painting' | 'General' | string;
  address: string;
  phone: string;
  email: string;
  gstNumber: string;
  panNumber: string;
  bankDetails: {
    bankName: string;
    accountName: string;
    accountNumber: string;
    ifscCode: string;
  };
  primaryContact: string;
  rating: number; // 1 to 5 stars
  purchaseCount: number;
  totalPurchaseAmount: number;
  status: 'Active' | 'Inactive' | 'Blocked';
  profileImage?: string;
  remarks?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const VendorSchema = new Schema<IVendor>(
  {
    name: {
      type: String,
      required: [true, 'Vendor name is required'],
      trim: true,
    },
    category: {
      type: String,
      enum: ['Masonry', 'Plumbing', 'Electrical', 'Wood & Framing', 'Painting', 'General'],
      default: 'General',
    },
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
    },
    gstNumber: {
      type: String,
      required: [true, 'GST number is required'],
      trim: true,
    },
    panNumber: {
      type: String,
      required: [true, 'PAN number is required'],
      trim: true,
    },
    bankDetails: {
      bankName: { type: String, required: true },
      accountName: { type: String, required: true },
      accountNumber: { type: String, required: true },
      ifscCode: { type: String, required: true },
    },
    primaryContact: {
      type: String,
      required: [true, 'Primary contact person is required'],
      trim: true,
    },
    rating: {
      type: Number,
      default: 5,
      min: 1,
      max: 5,
    },
    purchaseCount: {
      type: Number,
      default: 0,
    },
    totalPurchaseAmount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive', 'Blocked'],
      default: 'Active',
    },
    profileImage: {
      type: String,
      default: '',
    },
    remarks: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Vendor = model<IVendor>('Vendor', VendorSchema);
