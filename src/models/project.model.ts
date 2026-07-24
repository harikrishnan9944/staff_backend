import { Schema, model, Document, Types } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IProject extends Document {
  name: string;
  clientName: string;
  location: string;
  startDate?: string;
  expectedEndDate?: string;
  progress: number; // 0 to 100
  assignedUsers: Types.ObjectId[];
  stage: 'Planning' | 'Foundation' | 'Framing' | 'Electrical & Plumbing' | 'Finishing' | string;
  status: 'Active' | 'Completed' | 'Suspended' | 'Planning' | 'Finishing';
  remarks?: string;
  deletePassword?: string;
  createdAt: Date;
  updatedAt: Date;
  compareDeletePassword(candidatePassword: string): Promise<boolean>;
}

const ProjectSchema = new Schema<IProject>(
  {
    name: {
      type: String,
      required: [true, 'Project name is required'],
      trim: true,
    },
    clientName: {
      type: String,
      default: '',
    },
    location: {
      type: String,
      required: [true, 'Location is required'],
      trim: true,
    },
    startDate: {
      type: String,
      default: '',
    },
    expectedEndDate: {
      type: String,
      default: '',
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    assignedUsers: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    stage: {
      type: String,
      enum: ['Planning', 'Foundation', 'Framing', 'Electrical & Plumbing', 'Finishing'],
      default: 'Planning',
    },
    status: {
      type: String,
      enum: ['Active', 'Completed', 'Suspended', 'Planning', 'Finishing'],
      default: 'Active',
    },
    remarks: {
      type: String,
      default: '',
    },
    deletePassword: {
      type: String,
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save hook to hash delete password
ProjectSchema.pre('save', async function (next) {
  const project = this as any;

  if (!project.isModified('deletePassword') || !project.deletePassword) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    project.deletePassword = await bcrypt.hash(project.deletePassword, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

// Compare delete password method
ProjectSchema.methods.compareDeletePassword = async function (candidatePassword: string): Promise<boolean> {
  if (!this.deletePassword) {
    // Fallback for legacy projects
    return candidatePassword === 'delete123';
  }
  return bcrypt.compare(candidatePassword, this.deletePassword);
};

export const Project = model<IProject>('Project', ProjectSchema);

