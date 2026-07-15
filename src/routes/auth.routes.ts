import { Router } from 'express';
import { login, logout, refresh, me, changePassword } from '../controllers/auth.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { validateRequest } from '../middlewares/validate.middleware';
import { loginSchema, changePasswordSchema, registerSchema } from '../validation/auth.validation';
import { User } from '../models/user.model';

const router = Router();

// Public routes
router.post('/login', validateRequest(loginSchema), login);
router.post('/logout', logout);
router.post('/refresh', refresh);

// Protected routes (requires valid Access JWT)
router.get('/me', authenticate, me);
router.put('/change-password', authenticate, validateRequest(changePasswordSchema), changePassword);

// Admin-only route: Register a new employee (No public registration)
router.post(
  '/register',
  authenticate,
  authorize(['Admin']),
  validateRequest(registerSchema),
  async (req, res): Promise<void> => {
    try {
      const { name, username, password, role, email, phone, profileImage } = req.body;

      // Check if username already exists
      const usernameExists = await User.findOne({ username });
      if (usernameExists) {
        res.status(400).json({ success: false, message: 'Username is already taken' });
        return;
      }

      // Check if email already exists
      const emailExists = await User.findOne({ email });
      if (emailExists) {
        res.status(400).json({ success: false, message: 'Email is already registered' });
        return;
      }

      // Create user
      const user = await User.create({
        name,
        username,
        password,
        role,
        email,
        phone,
        profileImage,
        isActive: true,
      });

      res.status(201).json({
        success: true,
        message: `User '${username}' successfully created with role '${role}'`,
        user: {
          id: user._id,
          name: user.name,
          username: user.username,
          role: user.role,
          email: user.email,
        },
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

export default router;
