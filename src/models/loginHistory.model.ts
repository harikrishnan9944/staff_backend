import { Schema, model, Document, Types } from 'mongoose';

export interface ILoginHistory extends Document {
  userId: Types.ObjectId;
  timestamp: Date;
  ipAddress?: string;
  device?: string;
}

const LoginHistorySchema = new Schema<ILoginHistory>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    ipAddress: {
      type: String,
      trim: true,
    },
    device: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

export const LoginHistory = model<ILoginHistory>('LoginHistory', LoginHistorySchema);
