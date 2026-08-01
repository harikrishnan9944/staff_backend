import { Schema, model, Document, Types } from 'mongoose';

export interface IMaterial extends Document {
  projectId: Types.ObjectId;
  categoryId?: Types.ObjectId;
  materialName: string;
  brand: string;
  description?: string;
  quantity: number;
  unit: string; // e.g. 'kg', 'sqft', 'pcs', 'bags'
  estimatedCost: number;
  transportCharges?: number;
  vendorId?: Types.ObjectId;
  vendorName?: string;
  priority: 'High' | 'Medium' | 'Low';
  status: 'Registered' | 'Material Selection' | 'Material Approve' | 'Sectioned' | 'Quotation Set' | 'Awaiting Approval' | 'Quotation Approved' | 'Purchase Completed' | 'Bill Uploaded' | 'Cancelled';
  assignedUser?: Types.ObjectId;
  materialImage?: string;
  purchaseDeadline?: string;
  materialSelectionDeadline?: string;
  quotationSelectionDeadline?: string;
  remarks?: string;
  section?: string;
  stayAtSelection?: boolean;
  createdBy: Types.ObjectId;
  createdByRole?: string;
  lastUpdatedBy?: Types.ObjectId;
  lastUpdatedByRole?: string;
  lastUpdatedDate?: Date;
  sectionedDate?: Date;
  selectionDate?: Date;
  approvalDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MaterialSchema = new Schema<IMaterial>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Project ID is required'],
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: false,
    },
    materialName: {
      type: String,
      required: [true, 'Material name is required'],
      trim: true,
    },
    brand: {
      type: String,
      required: false,
      default: 'Generic',
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    quantity: {
      type: Number,
      required: false,
      default: 1,
      min: [0, 'Quantity cannot be negative'],
    },
    unit: {
      type: String,
      required: false,
      default: 'pcs',
      trim: true,
    },
    estimatedCost: {
      type: Number,
      required: false,
      default: 0,
      min: [0, 'Estimated cost cannot be negative'],
    },
    transportCharges: {
      type: Number,
      required: false,
      default: 0,
    },
    vendorId: {
      type: Schema.Types.ObjectId,
      ref: 'User', // Vendors can be users in the system or custom entities
    },
    vendorName: {
      type: String,
      default: '',
      trim: true,
    },
    priority: {
      type: String,
      enum: ['High', 'Medium', 'Low'],
      default: 'Medium',
    },
    section: {
      type: String,
      default: '',
      trim: true,
    },
    stayAtSelection: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['Registered', 'Material Selection', 'Material Approve', 'Sectioned', 'Quotation Set', 'Awaiting Approval', 'Quotation Approved', 'Purchase Completed', 'Bill Uploaded', 'Cancelled'],
      default: 'Registered',
    },
    assignedUser: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    materialImage: {
      type: String,
      default: '',
    },
    purchaseDeadline: {
      type: String,
      default: '',
    },
    materialSelectionDeadline: {
      type: String,
      default: '',
    },
    quotationSelectionDeadline: {
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
    createdByRole: {
      type: String,
    },
    lastUpdatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    lastUpdatedByRole: {
      type: String,
    },
    lastUpdatedDate: {
      type: Date,
    },
    sectionedDate: {
      type: Date,
    },
    selectionDate: {
      type: Date,
    },
    approvalDate: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for search performance
MaterialSchema.index({ categoryId: 1, materialName: 1 });
MaterialSchema.index({ createdAt: 1 }, { expireAfterSeconds: 40 * 24 * 60 * 60 });

export const Material = model<IMaterial>('Material', MaterialSchema);
