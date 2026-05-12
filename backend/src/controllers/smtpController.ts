import { Request, Response } from 'express';
import { smtpSettingsService } from '../services/smtpSettingsService';
import { asyncHandler } from '../middleware/errorHandler';

export const smtpController = {
  get: asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const data = await smtpSettingsService.get();
    res.json({ success: true, data });
  }),

  save: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { host, port, email, password, security } = req.body;
    if (!host || !port || !email) {
      res.status(400).json({ success: false, error: { message: 'host, port, and email are required' } });
      return;
    }
    const data = await smtpSettingsService.save({
      host,
      port: parseInt(port, 10),
      email,
      password: password || '',
      security: security || 'TLS',
    });
    res.json({ success: true, data, message: 'SMTP settings saved successfully' });
  }),

  /** Verify connection only (no email sent) */
  test: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { host, port, email, password, security } = req.body;
    const result = await smtpSettingsService.testConnection({
      host: host || '',
      port: parseInt(port, 10) || 587,
      email: email || '',
      password: password || '',
      security: security || 'TLS',
    });
    res.json({ success: result.success, message: result.message });
  }),

  /** Send an actual test email to verify end-to-end delivery */
  sendTest: asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { host, port, email, password, security, recipientEmail } = req.body;
    if (!recipientEmail) {
      res.status(400).json({ success: false, error: { message: 'recipientEmail is required' } });
      return;
    }
    const result = await smtpSettingsService.sendTestEmail(
      {
        host: host || '',
        port: parseInt(port, 10) || 587,
        email: email || '',
        password: password || '',
        security: security || 'TLS',
      },
      recipientEmail
    );
    res.json({ success: result.success, message: result.message });
  }),
};
