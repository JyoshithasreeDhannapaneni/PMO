import { Request, Response } from 'express';
import { authService } from '../services/authService';
import { passwordResetService } from '../services/passwordResetService';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { createHash } from 'crypto';

export const authController = {
  /**
   * POST /api/auth/login
   * Login user
   */
  login: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { email, username, password } = req.body;
    const usernameOrEmail = username || email;

    if (!usernameOrEmail || !password) {
      throw new AppError('Username/email and password are required', 400);
    }

    const result = await authService.login(usernameOrEmail, password);

    res.json({
      success: true,
      data: result,
    });
  }),

  /**
   * POST /api/auth/register
   * Register new user
   */
  register: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      throw new AppError('Name, email, and password are required', 400);
    }

    if (password.length < 6) {
      throw new AppError('Password must be at least 6 characters', 400);
    }

    const result = await authService.register(name, email, password);

    res.status(201).json({
      success: true,
      data: result,
    });
  }),

  /**
   * GET /api/auth/me
   * Get current user
   */
  me: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      throw new AppError('No token provided', 401);
    }

    const user = await authService.getUserFromToken(token);

    if (!user) {
      throw new AppError('Invalid or expired token', 401);
    }

    res.json({
      success: true,
      data: user,
    });
  }),

  /**
   * POST /api/auth/logout
   * Logout user
   */
  logout: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (token) {
      await authService.logout(token);
    }

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  }),

  /**
   * POST /api/auth/forgot-password
   * Request password reset
   */
  forgotPassword: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body;

    if (!email) {
      throw new AppError('Email is required', 400);
    }

    const result = await passwordResetService.createResetToken(email);

    res.json({
      success: true,
      message: result.message,
    });
  }),

  /**
   * POST /api/auth/reset-password
   * Reset password with token
   */
  resetPassword: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { token, password } = req.body;

    if (!token || !password) {
      throw new AppError('Token and new password are required', 400);
    }

    if (password.length < 6) {
      throw new AppError('Password must be at least 6 characters', 400);
    }

    const result = await passwordResetService.resetPassword(token, password);

    if (!result.success) {
      throw new AppError(result.message, 400);
    }

    res.json({
      success: true,
      message: result.message,
    });
  }),

  /**
   * POST /api/auth/change-password
   * Change password (authenticated user)
   */
  changePassword: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const { currentPassword, newPassword } = req.body;

    if (!token) {
      throw new AppError('Authentication required', 401);
    }

    if (!currentPassword || !newPassword) {
      throw new AppError('Current password and new password are required', 400);
    }

    if (newPassword.length < 6) {
      throw new AppError('New password must be at least 6 characters', 400);
    }

    const user = await authService.getUserFromToken(token);
    if (!user) {
      throw new AppError('Invalid token', 401);
    }

    // Verify current password
    const hashedCurrent = createHash('sha256').update(currentPassword).digest('hex');
    const isValid = await authService.verifyPassword(user.id, hashedCurrent);

    if (!isValid) {
      throw new AppError('Current password is incorrect', 400);
    }

    // Update password
    await authService.updatePassword(user.id, newPassword);

    res.json({
      success: true,
      message: 'Password changed successfully',
    });
  }),

  // ── User Management (Admin) ─────────────────────────────────────

  /**
   * GET /api/auth/users
   * List all users
   */
  getAllUsers: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) throw new AppError('Authentication required', 401);

    const requestingUser = await authService.getUserFromToken(token);
    if (!requestingUser) throw new AppError('Invalid token', 401);
    if (requestingUser.role !== 'ADMIN' && requestingUser.role !== 'MANAGER') {
      throw new AppError('Insufficient permissions', 403);
    }

    const users = await authService.getAllUsers();
    res.json({ success: true, data: users });
  }),

  /**
   * POST /api/auth/users
   * Create / invite a new user by email
   */
  createUser: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) throw new AppError('Authentication required', 401);

    const requestingUser = await authService.getUserFromToken(token);
    if (!requestingUser) throw new AppError('Invalid token', 401);
    if (requestingUser.role !== 'ADMIN') {
      throw new AppError('Only admins can create users', 403);
    }

    const { name, email, role, department } = req.body;
    if (!name || !email) {
      throw new AppError('Name and email are required', 400);
    }

    // Generate a simple 6-character password (e.g., "abc123")
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    const nums = '0123456789';
    const tempPassword = 
      chars[Math.floor(Math.random() * 26)] +
      chars[Math.floor(Math.random() * 26)] +
      chars[Math.floor(Math.random() * 26)] +
      nums[Math.floor(Math.random() * 10)] +
      nums[Math.floor(Math.random() * 10)] +
      nums[Math.floor(Math.random() * 10)];
    
    const result = await authService.createUserByAdmin(name, email, role || 'VIEWER', tempPassword, department);

    res.status(201).json({
      success: true,
      data: result,
      message: `User created. Temporary password: ${tempPassword}`,
    });
  }),

  /**
   * PUT /api/auth/users/:id/role
   * Update a user's role
   */
  updateUserRole: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) throw new AppError('Authentication required', 401);

    const requestingUser = await authService.getUserFromToken(token);
    if (!requestingUser) throw new AppError('Invalid token', 401);
    if (requestingUser.role !== 'ADMIN') {
      throw new AppError('Only admins can change user roles', 403);
    }

    const { id } = req.params;
    const { role } = req.body;

    if (!['ADMIN', 'MANAGER', 'VIEWER'].includes(role)) {
      throw new AppError('Invalid role. Must be ADMIN, MANAGER, or VIEWER', 400);
    }

    await authService.updateUserRole(id, role);
    res.json({ success: true, message: 'User role updated' });
  }),

  /**
   * PUT /api/auth/users/:id/toggle-active
   * Activate or deactivate a user
   */
  toggleUserActive: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) throw new AppError('Authentication required', 401);

    const requestingUser = await authService.getUserFromToken(token);
    if (!requestingUser) throw new AppError('Invalid token', 401);
    if (requestingUser.role !== 'ADMIN') {
      throw new AppError('Only admins can activate/deactivate users', 403);
    }

    const { id } = req.params;
    const { isActive } = req.body;

    if (isActive) {
      await authService.activateUser(id);
    } else {
      await authService.deactivateUser(id);
    }

    res.json({ success: true, message: isActive ? 'User activated' : 'User deactivated' });
  }),

  /**
   * DELETE /api/auth/users/:id
   * Delete a user
   */
  deleteUser: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) throw new AppError('Authentication required', 401);

    const requestingUser = await authService.getUserFromToken(token);
    if (!requestingUser) throw new AppError('Invalid token', 401);
    if (requestingUser.role !== 'ADMIN') {
      throw new AppError('Only admins can delete users', 403);
    }

    const { id } = req.params;

    if (id === requestingUser.id) {
      throw new AppError('You cannot delete your own account', 400);
    }

    await authService.deleteUserById(id);
    res.json({ success: true, message: 'User deleted' });
  }),
};
