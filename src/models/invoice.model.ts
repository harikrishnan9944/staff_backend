import { Schema, model, Document, Types } from 'mongoose';

export interface IInvoice extends Document {
  invoiceNumber: string;
  purchaseId: Types.ObjectId;
  projectId: Types.ObjectId;
  categoryId?: Types.ObjectId;
  materialId: Types.ObjectId;
  vendorId: Types.ObjectId;
  invoiceDate: Date;
  invoiceAmount: number;
  gstAmount: number;
  totalAmount: number;
  invoiceFiles: string[]; // Cloudinary secure URLs
  verificationStatus: 'Pending' | 'Verified' | 'Rejected' | 'Need Clarification';
  remarks?: string;
  uploadedBy: Types.ObjectId;
  verifiedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const InvoiceSchema = new Schema<IInvoice>(
  {
    invoiceNumber: {
      type: String,
      required: [true, 'Invoice number is required'],
      unique: true,
      trim: true,
    },
    purchaseId: {
      type: Schema.Types.ObjectId,
      ref: 'Purchase',
      required: [true, 'Purchase order ID is required'],
    },
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
    materialId: {
      type: Schema.Types.ObjectId,
      ref: 'Material',
      required: [true, 'Material ID is required'],
    },
    vendorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Vendor ID is required'],
    },
    invoiceDate: {
      type: Date,
      required: [true, 'Invoice date is required'],
    },
    invoiceAmount: {
      type: Number,
      required: [true, 'Invoice amount is required'],
      min: [0, 'Amount cannot be negative'],
    },
    gstAmount: {
      type: Number,
      required: [true, 'GST amount is required'],
      min: [0, 'GST cannot be negative'],
    },
    totalAmount: {
      type: Number,
      required: true,
      min: [0, 'Total amount cannot be negative'],
    },
    invoiceFiles: {
      type: [String],
      default: [],
    },
    verificationStatus: {
      type: String,
      enum: ['Pending', 'Verified', 'Rejected', 'Need Clarification'],
      default: 'Pending',
    },
    remarks: {
      type: String,
      trim: true,
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
InvoiceSchema.index({ purchaseId: 1 });

export const Invoice = model<IInvoice>('Invoice', InvoiceSchema);
