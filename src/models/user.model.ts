import { Schema, model, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  name: string;
  username: string;
  password: string;
  role: 'Admin' | 'Architect' | 'Head of Operations' | 'Manager' | 'Supervisor' | 'Purchase Supervisor' | 'Accountant' | 'Staff';
  email: string;
  phone?: string;
  profileImage?: string;
  isActive: boolean;
  lastLogin?: Date;
  createdBy?: Schema.Types.ObjectId;
  permissions: string[];
  employeeId?: string;
  department?: string;
  joiningDate?: Date;
  remarks?: string;
  twoFactorEnabled?: boolean;
  loginHistory?: Array<{
    timestamp: Date;
    ipAddress?: string;
    device?: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: [3, 'Username must be at least 3 characters'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
    },
    role: {
      type: String,
      enum: {
        values: [
          'Admin',
          'Architect',
          'Head of Operations',
          'Manager',
          'Supervisor',
          'Purchase Supervisor',
          'Accountant',
          'Staff',
        ],
        message: '{VALUE} is not a valid role',
      },
      required: [true, 'Role is required'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/\S+@\S+\.\S+/, 'Please use a valid email address'],
    },
    phone: {
      type: String,
      trim: true,
    },
    profileImage: {
      type: String,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    permissions: {
      type: [String],
      default: [],
    },
    employeeId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    department: {
      type: String,
      trim: true,
    },
    joiningDate: {
      type: Date,
    },
    remarks: {
      type: String,
      trim: true,
      default: '',
    },
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    loginHistory: [
      {
        timestamp: { type: Date, default: Date.now },
        ipAddress: String,
        device: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Pre-save hook to hash password
UserSchema.pre('save', async function (next) {
  const user = this as IUser;

  // Only hash the password if it has been modified (or is new)
  if (!user.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(user.password, salt);
    next();
  } catch (error: any) {
    next(error);
  }
});

// Compare password method
UserSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export const User = model<IUser>('User', UserSchema);
