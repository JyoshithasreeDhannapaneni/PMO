import { query, execute } from '../config/database';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';


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

export interface MicrosoftUserInfo {
  id: string;
  displayName: string;
  mail: string;
  userPrincipalName: string;
  jobTitle?: string;
  department?: string;
}

class AuthService {
  private hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  private verifyPasswordHash(password: string, hash: string): boolean {
    return this.hashPassword(password) === hash;
  }

  private generateToken(): string {
    return crypto.randomBytes(48).toString('hex');
  }

  async login(usernameOrEmail: string, password: string): Promise<AuthResult> {
    const result = await query(
      `SELECT * FROM users WHERE username = $1 OR email = $1 LIMIT 1`,
      [usernameOrEmail.toLowerCase()]
    );

    const user = result.rows[0];

    if (!user) {
      throw new AppError('Invalid username or password', 401);
    }

    if (!this.verifyPasswordHash(password, user.password)) {
      throw new AppError('Invalid username or password', 401);
    }

    const token = this.generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await execute(
      `INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)`,
      [uuidv4(), user.id, token, expiresAt]
    );

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

  async register(name: string, email: string, password: string, username?: string): Promise<AuthResult> {
    const userUsername = username || email.split('@')[0].toLowerCase();

    const existing = await query(
      `SELECT id FROM users WHERE email = $1 OR username = $2 LIMIT 1`,
      [email.toLowerCase(), userUsername.toLowerCase()]
    );

    if (existing.rows.length > 0) {
      throw new AppError('Username or email already registered', 400);
    }

    const hashedPassword = this.hashPassword(password);
    const userId = uuidv4();

    await execute(
      `INSERT INTO users (id, name, email, username, password, role) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, name, email.toLowerCase(), userUsername.toLowerCase(), hashedPassword, 'VIEWER']
    );

    const result = await query(`SELECT * FROM users WHERE id = ?`, [userId]);
    const user = result.rows[0];
    const token = this.generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await execute(
      `INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)`,
      [uuidv4(), user.id, token, expiresAt]
    );

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

  async getUserFromToken(token: string): Promise<UserPayload | null> {
    const result = await query(
      `SELECT s.*, u.id as user_id, u.name, u.email, u.role 
       FROM sessions s 
       JOIN users u ON s.user_id = u.id 
       WHERE s.token = $1`,
      [token]
    );

    const session = result.rows[0];

    if (!session || new Date(session.expires_at) < new Date()) {
      if (session) {
        await query(`DELETE FROM sessions WHERE id = $1`, [session.id]);
      }
      return null;
    }

    return {
      id: session.user_id,
      name: session.name,
      email: session.email,
      role: session.role as 'ADMIN' | 'MANAGER' | 'VIEWER',
    };
  }

  async logout(token: string): Promise<void> {
    await query(`DELETE FROM sessions WHERE token = $1`, [token]);
    logger.info('User logged out');
  }

  async createDefaultAdmin(): Promise<void> {
    const adminExists = await query(
      `SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1`
    );

    if (adminExists.rows.length === 0) {
      await query(
        `INSERT INTO users (name, email, username, password, role) 
         VALUES ($1, $2, $3, $4, $5)`,
        ['Administrator', 'admin@company.com', 'admin', this.hashPassword('admin2026'), 'ADMIN']
      );
      logger.info('Default admin user created (admin / admin2026)');
    } else {
      logger.info('Admin user already exists');
    }
  }

  async verifyPassword(userId: string, hashedPassword: string): Promise<boolean> {
    const result = await query(`SELECT password FROM users WHERE id = $1`, [userId]);
    if (result.rows.length === 0) return false;
    return result.rows[0].password === hashedPassword;
  }

  async updatePassword(userId: string, newPassword: string): Promise<void> {
    const hashedPassword = this.hashPassword(newPassword);
    await query(
      `UPDATE users SET password = $1 WHERE id = $2`,
      [hashedPassword, userId]
    );
    
    await query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
    
    logger.info(`Password updated for user: ${userId}`);
  }

  async getAllUsers() {
    const result = await query(
      `SELECT id, name, email, username, role, department, is_active, last_login_at, created_at 
       FROM users ORDER BY created_at DESC`
    );
    return result.rows.map(row => ({
      ...row,
      isActive: row.is_active,
      lastLoginAt: row.last_login_at,
      createdAt: row.created_at,
    }));
  }

  async updateUserRole(userId: string, role: 'ADMIN' | 'MANAGER' | 'VIEWER'): Promise<void> {
    await query(`UPDATE users SET role = $1 WHERE id = $2`, [role, userId]);
    logger.info(`User role updated: ${userId} -> ${role}`);
  }

  async deactivateUser(userId: string): Promise<void> {
    await query(`UPDATE users SET is_active = false WHERE id = $1`, [userId]);
    await query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
    logger.info(`User deactivated: ${userId}`);
  }

  async activateUser(userId: string): Promise<void> {
    await query(`UPDATE users SET is_active = true WHERE id = $1`, [userId]);
    logger.info(`User activated: ${userId}`);
  }

  async createUserByAdmin(
    name: string,
    email: string,
    role: 'ADMIN' | 'MANAGER' | 'VIEWER',
    tempPassword: string,
    department?: string
  ): Promise<any> {
    const username = email.split('@')[0].toLowerCase();

    const existing = await query(
      `SELECT id FROM users WHERE email = $1 OR username = $2 LIMIT 1`,
      [email.toLowerCase(), username]
    );

    if (existing.rows.length > 0) {
      throw new AppError('A user with this email already exists', 400);
    }

    const hashedPassword = this.hashPassword(tempPassword);
    const userId = uuidv4();

    await execute(
      `INSERT INTO users (id, name, email, username, password, role, department, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, true, NOW(), NOW())`,
      [userId, name, email.toLowerCase(), username, hashedPassword, role, department || null]
    );

    logger.info(`User created by admin: ${email} with role ${role}`);

    return {
      id: userId,
      name,
      email: email.toLowerCase(),
      username,
      role,
      department: department || null,
      isActive: true,
    };
  }

  async deleteUserById(userId: string): Promise<void> {
    await query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
    await query(`DELETE FROM users WHERE id = $1`, [userId]);
    logger.info(`User deleted: ${userId}`);
  }

  // Microsoft OAuth Methods with PKCE support
  private pkceStore: Map<string, { codeVerifier: string; createdAt: number }> = new Map();

  private generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  private generateCodeChallenge(verifier: string): string {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }

  getMicrosoftAuthUrl(): { url: string; state: string } {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';
    const redirectUri = process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:3001/api/auth/microsoft/callback';
    const scope = encodeURIComponent('openid profile email User.Read');
    
    // Generate PKCE values
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);
    const state = crypto.randomBytes(16).toString('hex');
    
    // Store code verifier with state (cleanup old entries)
    this.cleanupPkceStore();
    this.pkceStore.set(state, { codeVerifier, createdAt: Date.now() });
    
    const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?` +
      `client_id=${clientId}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_mode=query` +
      `&scope=${scope}` +
      `&state=${state}` +
      `&code_challenge=${codeChallenge}` +
      `&code_challenge_method=S256`;
    
    return { url: authUrl, state };
  }

  private cleanupPkceStore(): void {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    for (const [key, value] of this.pkceStore.entries()) {
      if (value.createdAt < fiveMinutesAgo) {
        this.pkceStore.delete(key);
      }
    }
  }

  getCodeVerifier(state: string): string | null {
    const entry = this.pkceStore.get(state);
    if (entry) {
      this.pkceStore.delete(state);
      return entry.codeVerifier;
    }
    return null;
  }

  async exchangeMicrosoftCode(code: string, codeVerifier: string): Promise<{ accessToken: string; idToken: string }> {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    const tenantId = process.env.MICROSOFT_TENANT_ID || 'common';
    const redirectUri = process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:3001/api/auth/microsoft/callback';

    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    
    const params = new URLSearchParams();
    params.append('client_id', clientId || '');
    params.append('client_secret', clientSecret || '');
    params.append('code', code);
    params.append('redirect_uri', redirectUri);
    params.append('grant_type', 'authorization_code');
    params.append('scope', 'openid profile email User.Read');
    params.append('code_verifier', codeVerifier);

    logger.info(`Exchanging Microsoft code for tokens...`);
    logger.info(`Token URL: ${tokenUrl}`);
    logger.info(`Client ID: ${clientId}`);
    logger.info(`Client Secret (first 10 chars): ${clientSecret?.substring(0, 10)}...`);
    logger.info(`Redirect URI: ${redirectUri}`);
    logger.info(`Code verifier length: ${codeVerifier?.length}`);
    logger.info(`Code (first 50 chars): ${code?.substring(0, 50)}...`);

    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      logger.info(`Microsoft token response status: ${response.status}`);

      const responseText = await response.text();
      logger.info(`Microsoft token response body (first 500 chars): ${responseText.substring(0, 500)}`);

      if (!response.ok) {
        try {
          const errorJson = JSON.parse(responseText);
          logger.error(`Microsoft error code: ${errorJson.error}`);
          logger.error(`Microsoft error description: ${errorJson.error_description}`);
          throw new AppError(`Microsoft auth failed: ${errorJson.error_description || errorJson.error}`, 401);
        } catch (parseErr: any) {
          if (parseErr instanceof AppError) throw parseErr;
          logger.error(`Failed to parse error response: ${responseText}`);
          throw new AppError('Failed to authenticate with Microsoft', 401);
        }
      }

      const data = JSON.parse(responseText);
      return {
        accessToken: data.access_token,
        idToken: data.id_token,
      };
    } catch (fetchError: any) {
      logger.error('Fetch error during token exchange:', fetchError.message);
      throw fetchError;
    }
  }

  async getMicrosoftUserInfo(accessToken: string): Promise<MicrosoftUserInfo> {
    const response = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new AppError('Failed to get user info from Microsoft', 401);
    }

    const data = await response.json();
    return {
      id: data.id,
      displayName: data.displayName,
      mail: data.mail || data.userPrincipalName,
      userPrincipalName: data.userPrincipalName,
      jobTitle: data.jobTitle,
      department: data.department,
    };
  }

  async loginWithMicrosoft(microsoftUser: MicrosoftUserInfo): Promise<AuthResult> {
    const email = microsoftUser.mail.toLowerCase();
    
    // Check if user exists
    let result = await query(
      `SELECT * FROM users WHERE email = $1 OR microsoft_id = $2 LIMIT 1`,
      [email, microsoftUser.id]
    );

    let user = result.rows[0];

    if (!user) {
      // Create new user from Microsoft account
      const userId = uuidv4();
      const username = email.split('@')[0].toLowerCase();
      
      await execute(
        `INSERT INTO users (id, name, email, username, password, role, microsoft_id, department, is_active, auth_provider)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, true, 'microsoft')`,
        [
          userId,
          microsoftUser.displayName,
          email,
          username,
          '', // No password for Microsoft users
          'VIEWER', // Default role
          microsoftUser.id,
          microsoftUser.department || null,
        ]
      );

      result = await query(`SELECT * FROM users WHERE id = ?`, [userId]);
      user = result.rows[0];
      logger.info(`New user created via Microsoft login: ${email}`);
    } else {
      // Update Microsoft ID if not set
      if (!user.microsoft_id) {
        await execute(
          `UPDATE users SET microsoft_id = ?, auth_provider = 'microsoft' WHERE id = ?`,
          [microsoftUser.id, user.id]
        );
      }
      logger.info(`User logged in via Microsoft: ${email}`);
    }

    // Create session
    const token = this.generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await execute(
      `INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)`,
      [uuidv4(), user.id, token, expiresAt]
    );

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

  isMicrosoftConfigured(): boolean {
    return !!(
      process.env.MICROSOFT_CLIENT_ID &&
      process.env.MICROSOFT_CLIENT_SECRET &&
      process.env.MICROSOFT_CLIENT_ID !== 'your-azure-client-id'
    );
  }
}

export const authService = new AuthService();
