import { Router } from 'express';
import { notificationController } from '../controllers/notificationController';

const router = Router();

// GET /api/notifications - Get all notifications
router.get('/', notificationController.getAll);

// PUT /api/notifications/mark-all-read - Mark all as read
router.put('/mark-all-read', notificationController.markAllAsRead);

// PUT /api/notifications/:id/read - Mark single notification as read
router.put('/:id/read', notificationController.markAsRead);

// POST /api/notifications/test - Send test notification (dev only)
router.post('/test', notificationController.sendTest);

// POST /api/notifications/test-email - Send a test email using provided SMTP settings
router.post('/test-email', notificationController.sendTestEmail);

export default router;
