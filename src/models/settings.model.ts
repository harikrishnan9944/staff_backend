import { Schema, model, Document } from 'mongoose';

export interface ICompanySettings extends Document {
  companyName: string;
  companyLogo?: string;
  address: string;
  phone: string;
  email: string;
  website?: string;
  gstNumber: string;
  panNumber: string;
  currency: string; // e.g. 'USD', 'INR'
  language: string; // e.g. 'en', 'es'
  timezone: string;
  workingHours: string; // e.g. '09:00 - 18:00'
  businessDays: string[]; // e.g. ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  createdAt: Date;
  updatedAt: Date;
}

const CompanySettingsSchema = new Schema<ICompanySettings>(
  {
    companyName: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
    },
    companyLogo: {
      type: String,
      default: '',
    },
    address: {
      type: String,
      required: [true, 'Company address is required'],
    },
    phone: {
      type: String,
      required: [true, 'Company phone is required'],
    },
    email: {
      type: String,
      required: [true, 'Company email is required'],
    },
    website: {
      type: String,
      trim: true,
    },
    gstNumber: {
      type: String,
      required: [true, 'GST number is required'],
    },
    panNumber: {
      type: String,
      required: [true, 'PAN number is required'],
    },
    currency: {
      type: String,
      default: 'USD',
    },
    language: {
      type: String,
      default: 'en',
    },
    timezone: {
      type: String,
      default: 'UTC',
    },
    workingHours: {
      type: String,
      default: '09:00 - 18:00',
    },
    businessDays: {
      type: [String],
      default: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    },
  },
  {
    timestamps: true,
  }
);

export const CompanySettings = model<ICompanySettings>('CompanySettings', CompanySettingsSchema);
