import { Schema, model, Document, Types } from 'mongoose';

export interface IPurchase extends Document {
  purchaseOrderNumber: string;
  projectId: Types.ObjectId;
  categoryId?: Types.ObjectId;
  materialId: Types.ObjectId;
  quotationId?: string;
  vendorId?: Types.ObjectId;
  vendorName?: string;
  purchaseAmount: number;
  gst: number;
  discount: number;
  finalAmount: number;
  purchaseDate: Date;
  expectedDeliveryDate: Date;
  actualDeliveryDate?: Date;
  deliveryStatus: 'Pending' | 'Ordered' | 'Vendor Confirmed' | 'Dispatched' | 'In Transit' | 'Delivered' | 'Cancelled';
  paymentStatus: 'Pending' | 'Partially Paid' | 'Paid';
  status: 'Draft' | 'Ordered' | 'Approved' | 'Delivered' | 'Completed' | 'Cancelled';
  attachments: string[];
  remarks?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PurchaseSchema = new Schema<IPurchase>(
  {
    purchaseOrderNumber: {
      type: String,
      required: [true, 'Purchase order number is required'],
      unique: true,
      trim: true,
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
    quotationId: {
      type: String,
      trim: true,
    },
    vendorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    vendorName: {
      type: String,
      default: '',
    },
    purchaseAmount: {
      type: Number,
      required: [true, 'Purchase amount is required'],
      min: [0, 'Purchase amount cannot be negative'],
    },
    gst: {
      type: Number,
      default: 0,
      min: [0, 'GST cannot be negative'],
    },
    discount: {
      type: Number,
      default: 0,
      min: [0, 'Discount cannot be negative'],
    },
    finalAmount: {
      type: Number,
      required: true,
      min: [0, 'Final amount cannot be negative'],
    },
    purchaseDate: {
      type: Date,
      required: [true, 'Purchase date is required'],
    },
    expectedDeliveryDate: {
      type: Date,
      required: [true, 'Expected delivery date is required'],
    },
    actualDeliveryDate: {
      type: Date,
    },
    deliveryStatus: {
      type: String,
      enum: ['Pending', 'Ordered', 'Vendor Confirmed', 'Dispatched', 'In Transit', 'Delivered', 'Cancelled'],
      default: 'Pending',
    },
    paymentStatus: {
      type: String,
      enum: ['Pending', 'Partially Paid', 'Paid'],
      default: 'Pending',
    },
    status: {
      type: String,
      enum: ['Draft', 'Ordered', 'Approved', 'Delivered', 'Completed', 'Cancelled'],
      default: 'Draft',
    },
    attachments: {
      type: [String],
      default: [],
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

// Indexes for query speed
PurchaseSchema.index({ projectId: 1 });
PurchaseSchema.index({ createdAt: 1 }, { expireAfterSeconds: 40 * 24 * 60 * 60 });

export const Purchase = model<IPurchase>('Purchase', PurchaseSchema);
