import { Schema, model, Document, Types } from 'mongoose';

export interface INotification extends Document {
  userId: Types.ObjectId;
  title: string;
  message: string;
  category: 'System' | 'Project' | 'Purchase' | 'Payment' | 'Material' | 'Vendor' | 'Quotation';
  priority: 'Critical' | 'Normal' | 'Low';
  read: boolean;
  data?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ['System', 'Project', 'Purchase', 'Payment', 'Material', 'Vendor', 'Quotation'],
      default: 'System',
    },
    priority: {
      type: String,
      enum: ['Critical', 'Normal', 'Low'],
      default: 'Normal',
    },
    read: {
      type: Boolean,
      default: false,
    },
    data: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

export const Notification = model<INotification>('Notification', NotificationSchema);
