import { prisma } from '../config/database';
import { createHash, randomBytes } from 'crypto';
import { logger } from '../utils/logger';
import { emailService } from './emailService';

class PasswordResetService {
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async createResetToken(email: string): Promise<{ success: boolean; message: string }> {
    const user = await prisma.user.findUnique({ where: { email } });
    
    if (!user) {
      // Don't reveal if user exists
      return { success: true, message: 'If an account exists, a reset email has been sent' };
    }

    // Delete any existing reset tokens for this user
    await prisma.passwordReset.deleteMany({ where: { userId: user.id } });

    // Generate token
    const rawToken = randomBytes(32).toString('hex');
    const hashedToken = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordReset.create({
      data: {
        userId: user.id,
        token: hashedToken,
        expiresAt,
      },
    });

    // Send email
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
    
    const reset = await prisma.passwordReset.findUnique({
      where: { token: hashedToken },
    });

    if (!reset) {
      return { valid: false };
    }

    if (reset.expiresAt < new Date()) {
      await prisma.passwordReset.delete({ where: { id: reset.id } });
      return { valid: false };
    }

    if (reset.usedAt) {
      return { valid: false };
    }

    return { valid: true, userId: reset.userId };
  }

  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    const validation = await this.validateToken(token);
    
    if (!validation.valid || !validation.userId) {
      return { success: false, message: 'Invalid or expired reset token' };
    }

    const hashedToken = this.hashToken(token);
    const hashedPassword = createHash('sha256').update(newPassword).digest('hex');

    // Update password and mark token as used
    await prisma.$transaction([
      prisma.user.update({
        where: { id: validation.userId },
        data: { password: hashedPassword },
      }),
      prisma.passwordReset.update({
        where: { token: hashedToken },
        data: { usedAt: new Date() },
      }),
      // Invalidate all sessions for this user
      prisma.session.deleteMany({
        where: { userId: validation.userId },
      }),
    ]);

    logger.info(`Password reset completed for user: ${validation.userId}`);
    return { success: true, message: 'Password has been reset successfully' };
  }
}

export const passwordResetService = new PasswordResetService();
