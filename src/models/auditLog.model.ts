import { Schema, model, Document, Types } from 'mongoose';

export interface IAuditLog extends Document {
  performedBy: Types.ObjectId;
  action: 'ASSIGN_ROLE' | 'REMOVE_ROLE' | 'TRANSFER_USER' | string;
  projectId?: Types.ObjectId;
  targetUserId?: Types.ObjectId;
  details: string;
  timestamp: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Performed by is required'],
    },
    action: {
      type: String,
      required: [true, 'Action is required'],
      trim: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
    },
    targetUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    details: {
      type: String,
      required: [true, 'Details are required'],
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

export const AuditLog = model<IAuditLog>('AuditLog', AuditLogSchema);
