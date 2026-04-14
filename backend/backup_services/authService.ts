import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import crypto from 'crypto';

export interface UserPayload {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'VIEWER';
}

export interface AuthResult {
  user: UserPayload;
  token: string;
}

class AuthService {
  /**
   * Hash password using SHA256
   */
  private hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  /**
   * Verify password
   */
  public verifyPassword(password: string, hash: string): boolean {
    return this.hashPassword(password) === hash;
  }

  /**
   * Generate secure token
   */
  private generateToken(): string {
    return crypto.randomBytes(48).toString('hex');
  }

  /**
   * Login user (supports both username and email)
   */
  async login(usernameOrEmail: string, password: string): Promise<AuthResult> {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: usernameOrEmail.toLowerCase() },
          { email: usernameOrEmail.toLowerCase() },
        ],
      },
    });

    if (!user) {
      throw new AppError('Invalid username or password', 401);
    }

    if (!this.verifyPassword(password, user.password)) {
      throw new AppError('Invalid username or password', 401);
    }

    const token = this.generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    logger.info(`User logged in: ${user.username}`);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role as 'ADMIN' | 'MANAGER' | 'VIEWER',
      },
      token,
    };
  }

  /**
   * Register new user
   */
  async register(name: string, email: string, password: string, username?: string): Promise<AuthResult> {
    const userUsername = username || email.split('@')[0].toLowerCase();

    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email: email.toLowerCase() },
          { username: userUsername.toLowerCase() },
        ],
      },
    });

    if (existing) {
      throw new AppError('Username or email already registered', 400);
    }

    const hashedPassword = this.hashPassword(password);

    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        username: userUsername.toLowerCase(),
        password: hashedPassword,
        role: 'VIEWER',
      },
    });

    const token = this.generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    logger.info(`User registered: ${user.username}`);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role as 'ADMIN' | 'MANAGER' | 'VIEWER',
      },
      token,
    };
  }

  /**
   * Get user from token
   */
  async getUserFromToken(token: string): Promise<UserPayload | null> {
    const session = await prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await prisma.session.delete({ where: { id: session.id } });
      }
      return null;
    }

    return {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role as 'ADMIN' | 'MANAGER' | 'VIEWER',
    };
  }

  /**
   * Logout user (invalidate token)
   */
  async logout(token: string): Promise<void> {
    await prisma.session.deleteMany({
      where: { token },
    });
    logger.info('User logged out');
  }

  /**
   * Create default admin user if none exists
   */
  async createDefaultAdmin(): Promise<void> {
    const adminExists = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
    });

    if (!adminExists) {
      await prisma.user.create({
        data: {
          name: 'Administrator',
          email: 'admin@company.com',
          username: 'admin',
          password: this.hashPassword('admin2026'),
          role: 'ADMIN',
        },
      });
      logger.info('Default admin user created (admin / admin2026)');
    } else {
      logger.info('Admin user already exists');
    }
  }

  /**
   * Verify password for a user (public method for password change)
   */
  async verifyPassword(userId: string, hashedPassword: string): Promise<boolean> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return false;
    return user.password === hashedPassword;
  }

  /**
   * Update user password
   */
  async updatePassword(userId: string, newPassword: string): Promise<void> {
    const hashedPassword = this.hashPassword(newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });
    
    // Invalidate all sessions except current
    await prisma.session.deleteMany({
      where: { userId },
    });
    
    logger.info(`Password updated for user: ${userId}`);
  }

  /**
   * Get all users (admin only)
   */
  async getAllUsers() {
    return prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        role: true,
        department: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Update user role (admin only)
   */
  async updateUserRole(userId: string, role: 'ADMIN' | 'MANAGER' | 'VIEWER'): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { role },
    });
    logger.info(`User role updated: ${userId} -> ${role}`);
  }

  /**
   * Deactivate user (admin only)
   */
  async deactivateUser(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });
    
    // Invalidate all sessions
    await prisma.session.deleteMany({
      where: { userId },
    });
    
    logger.info(`User deactivated: ${userId}`);
  }
}

export const authService = new AuthService();
