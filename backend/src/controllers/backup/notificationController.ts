import { Request, Response } from 'express';
import { notificationService } from '../services/notificationService';
import { asyncHandler } from '../middleware/errorHandler';

export const notificationController = {
  /**
   * GET /api/notifications
   * Get all notifications with pagination
   */
  getAll: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const projectId = req.query.projectId as string;

    const result = await notificationService.getNotifications(page, limit, projectId);

    res.json({
      success: true,
      data: result.notifications,
      pagination: {
        page,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  }),

  /**
   * PUT /api/notifications/:id/read
   * Mark a notification as read
   */
  markAsRead: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    await notificationService.markAsRead(id);
    res.json({ success: true, message: 'Notification marked as read' });
  }),

  /**
   * PUT /api/notifications/mark-all-read
   * Mark all notifications as read
   */
  markAllAsRead: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await notificationService.markAllAsRead();
    res.json({ success: true, message: 'All notifications marked as read' });
  }),

  /**
   * POST /api/notifications/test
   * Send a test notification (development only)
   */
  sendTest: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (process.env.NODE_ENV === 'production') {
      res.status(403).json({
        success: false,
        error: { message: 'Test notifications not available in production' },
      });
      return;
    }

    const { type, title, message, recipients } = req.body;

    await notificationService.createNotification(
      type || 'GENERAL',
      title || 'Test Notification',
      message || 'This is a test notification',
      recipients || ['test@example.com']
    );

    res.json({
      success: true,
      message: 'Test notification sent',
    });
  }),
};
