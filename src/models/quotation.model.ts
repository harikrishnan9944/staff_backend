import { Schema, model, Document, Types } from 'mongoose';

export interface IQuotation extends Document {
  materialId: Types.ObjectId;
  vendor: string;
  amount: number;
  description?: string;
  status: 'Pending' | 'Selected' | 'Approved' | 'Rejected';
  createdDate: string;
  quotationImage?: string;
  transportCharges?: number;
}

const QuotationSchema = new Schema<IQuotation>(
  {
    materialId: {
      type: Schema.Types.ObjectId,
      ref: 'Material',
      required: [true, 'Material ID is required'],
    },
    vendor: {
      type: String,
      required: [true, 'Vendor is required'],
      trim: true,
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0, 'Amount cannot be negative'],
    },
    description: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['Pending', 'Selected', 'Approved', 'Rejected'],
      default: 'Pending',
    },
    createdDate: {
      type: String,
      default: () => new Date().toISOString().split('T')[0],
    },
    quotationImage: {
      type: String,
      default: '',
    },
    transportCharges: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

QuotationSchema.index({ materialId: 1, status: 1 });
QuotationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 40 * 24 * 60 * 60 });

export const Quotation = model<IQuotation>('Quotation', QuotationSchema);
