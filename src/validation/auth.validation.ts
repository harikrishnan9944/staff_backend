import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string({ required_error: 'Name is required' }).min(2, 'Name must be at least 2 characters'),
  username: z
    .string({ required_error: 'Username is required' })
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username cannot exceed 20 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain alphanumeric characters and underscores'),
  password: z
    .string({ required_error: 'Password is required' })
    .min(6, 'Password must be at least 6 characters'),
  role: z.enum(
    ['Admin', 'Head of Operations', 'Manager', 'Staff'],
    { errorMap: () => ({ message: 'Invalid role provided' }) }
  ),
  email: z.string({ required_error: 'Email is required' }).email('Invalid email address'),
  phone: z.string().optional(),
  profileImage: z.string().url('Profile image must be a valid URL').optional().or(z.literal('')),
  isActive: z.boolean().optional(),
  employeeId: z.string().optional(),
  department: z.string().optional(),
  joiningDate: z.string().optional(),
  remarks: z.string().optional(),
});

export const loginSchema = z.object({
  username: z.string({ required_error: 'Username is required' }).min(1, 'Username is required'),
  password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required'),
});

export const changePasswordSchema = z.object({
  oldPassword: z.string({ required_error: 'Old password is required' }).min(1, 'Old password is required'),
  newPassword: z
    .string({ required_error: 'New password is required' })
    .min(6, 'New password must be at least 6 characters'),
});
