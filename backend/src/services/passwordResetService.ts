import { query, execute, transaction } from '../config/database';
import { createHash, randomBytes } from 'crypto';
import { logger } from '../utils/logger';
import { emailService } from './emailService';
import { v4 as uuidv4 } from 'uuid';

class PasswordResetService {
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async createResetToken(email: string): Promise<{ success: boolean; message: string }> {
    const userResult = await query(`SELECT * FROM users WHERE email = $1`, [email]);
    const user = userResult.rows[0];
    
    if (!user) {
      return { success: true, message: 'If an account exists, a reset email has been sent' };
    }

    await query(`DELETE FROM password_resets WHERE user_id = $1`, [user.id]);

    const rawToken = randomBytes(32).toString('hex');
    const hashedToken = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await execute(
      `INSERT INTO password_resets (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)`,
      [uuidv4(), user.id, hashedToken, expiresAt]
    );

    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${rawToken}`;
    
    try {
      await emailService.sendEmail({
        to: user.email,
        subject: 'Password Reset Request - PMO Tracker',
        html: `
          <h2>Password Reset Request</h2>
          <p>Hello ${user.name},</p>
          <p>You requested to reset your password. Click the link below to set a new password:</p>
          <p><a href="${resetUrl}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a></p>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this, please ignore this email.</p>
          <p>Best regards,<br>PMO Tracker Team</p>
        `,
      });
    } catch (error) {
      logger.error('Failed to send password reset email:', error);
    }

    logger.info(`Password reset token created for user: ${user.id}`);
    return { success: true, message: 'If an account exists, a reset email has been sent' };
  }

  async validateToken(token: string): Promise<{ valid: boolean; userId?: string }> {
    const hashedToken = this.hashToken(token);
    
    const result = await query(
      `SELECT * FROM password_resets WHERE token = $1`,
      [hashedToken]
    );

    const reset = result.rows[0];

    if (!reset) {
      return { valid: false };
    }

    if (new Date(reset.expires_at) < new Date()) {
      await query(`DELETE FROM password_resets WHERE id = $1`, [reset.id]);
      return { valid: false };
    }

    if (reset.used_at) {
      return { valid: false };
    }

    return { valid: true, userId: reset.user_id };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    const validation = await this.validateToken(token);
    
    if (!validation.valid || !validation.userId) {
      return { success: false, message: 'Invalid or expired reset token' };
    }

    const hashedToken = this.hashToken(token);
    const hashedPassword = createHash('sha256').update(newPassword).digest('hex');

    await transaction(async (client) => {
      await client.query(
        `UPDATE users SET password = $1 WHERE id = $2`,
        [hashedPassword, validation.userId]
      );
      await client.query(
        `UPDATE password_resets SET used_at = NOW() WHERE token = $1`,
        [hashedToken]
      );
      await client.query(
        `DELETE FROM sessions WHERE user_id = $1`,
        [validation.userId]
      );
    });

    logger.info(`Password reset completed for user: ${validation.userId}`);
    return { success: true, message: 'Password has been reset successfully' };
  }
}

export const passwordResetService = new PasswordResetService();
