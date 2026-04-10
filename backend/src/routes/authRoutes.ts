import { Router } from 'express';
import { authController } from '../controllers/authController';

const router = Router();

// POST /api/auth/login - Login user
router.post('/login', authController.login);

// POST /api/auth/register - Register new user
router.post('/register', authController.register);

// GET /api/auth/me - Get current user
router.get('/me', authController.me);

// POST /api/auth/logout - Logout user
router.post('/logout', authController.logout);

// POST /api/auth/forgot-password - Request password reset
router.post('/forgot-password', authController.forgotPassword);

// POST /api/auth/reset-password - Reset password with token
router.post('/reset-password', authController.resetPassword);

// POST /api/auth/change-password - Change password (authenticated)
router.post('/change-password', authController.changePassword);

// ── User Management (Admin) ─────────────────────────────────────────
// GET /api/auth/users - List all users
router.get('/users', authController.getAllUsers);

// POST /api/auth/users - Create/invite a new user by email
router.post('/users', authController.createUser);

// PUT /api/auth/users/:id/role - Update a user's role
router.put('/users/:id/role', authController.updateUserRole);

// PUT /api/auth/users/:id/toggle-active - Activate/deactivate a user
router.put('/users/:id/toggle-active', authController.toggleUserActive);

// DELETE /api/auth/users/:id - Remove a user
router.delete('/users/:id', authController.deleteUser);

export default router;
