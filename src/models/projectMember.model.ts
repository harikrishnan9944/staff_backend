import { Schema, model, Document, Types } from 'mongoose';

export interface IProjectMember extends Document {
  projectId: Types.ObjectId;
  userId: Types.ObjectId;
  role: 'Operation Head' | 'Project Manager' | 'Purchaser' | 'Supervisor' | 'Architect' | 'Accountant' | 'Store Keeper' | 'Safety Officer' | string;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectMemberSchema = new Schema<IProjectMember>(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Project ID is required'],
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
    role: {
      type: String,
      required: [true, 'Role is required'],
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Optimize query performance with combined index
ProjectMemberSchema.index({ projectId: 1, userId: 1, role: 1 }, { unique: true });
ProjectMemberSchema.index({ userId: 1, projectId: 1 });

export const ProjectMember = model<IProjectMember>('ProjectMember', ProjectMemberSchema);
