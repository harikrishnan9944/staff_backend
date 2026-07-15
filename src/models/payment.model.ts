import { Schema, model, Document, Types } from 'mongoose';

export interface IPayment extends Document {
  projectId: Types.ObjectId;
  purchaseId: Types.ObjectId;
  vendorId: Types.ObjectId;
  amount: number;
  paymentType: 'UPI' | 'Cheque' | 'Bank Transfer' | 'Cash';
  transactionNumber?: string;
  chequeNumber?: string;
  status: 'Pending' | 'Completed' | 'Cancelled';
  paymentDate: Date;
  notes?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    purchaseId: {
      type: Schema.Types.ObjectId,
      ref: 'Purchase',
      required: true,
    },
    vendorId: {
      type: Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true,
    },
    amount: {
      type: Number,
      required: [true, 'Payment amount is required'],
      min: [0, 'Payment amount cannot be negative'],
    },
    paymentType: {
      type: String,
      enum: ['UPI', 'Cheque', 'Bank Transfer', 'Cash'],
      required: true,
    },
    transactionNumber: {
      type: String,
      trim: true,
    },
    chequeNumber: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['Pending', 'Completed', 'Cancelled'],
      default: 'Completed',
    },
    paymentDate: {
      type: Date,
      default: Date.now,
    },
    notes: {
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

// Index
PaymentSchema.index({ purchaseId: 1 });
PaymentSchema.index({ vendorId: 1 });

export const Payment = model<IPayment>('Payment', PaymentSchema);
