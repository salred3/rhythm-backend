import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { UserRepository } from '../users/user.repository';
import { SessionRepository } from './repositories/session.repository';
import { TokenService } from './services/token.service';
import { EmailService } from '../../common/services/email.service';
import { CacheService } from '../../common/services/cache.service';
import { SecurityService } from './services/security.service';
import { AppError } from '../../common/exceptions/app.error';
import { EventEmitter } from 'events';

interface LoginContext {
  userAgent: string;
  ipAddress: string;
  deviceFingerprint?: string;
}

interface AuthResult {
  user: any;
  tokens: {
    accessToken: string;
    refreshToken?: string;
  };
}

export class AuthService {
  private userRepository = new UserRepository();
  private sessionRepository = new SessionRepository();
  private tokenService = new TokenService();
  private emailService = new EmailService();
  private cacheService = new CacheService();
  private securityService = new SecurityService();
  private eventEmitter = new EventEmitter();

  private readonly MAX_LOGIN_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION = 30 * 60 * 1000;
  private readonly PASSWORD_RESET_TOKEN_EXPIRY = 60 * 60 * 1000;
  private readonly SESSION_DURATION = 30 * 24 * 60 * 60 * 1000;

  async signup(signupData: SignupDto): Promise<AuthResult> {
    const existingUser = await this.userRepository.findByEmail(signupData.email);
    if (existingUser) {
      throw new AppError('Email already registered', 409);
    }

    this.validatePasswordStrength(signupData.password);

    const passwordHash = await bcrypt.hash(signupData.password, 12);

    const user = await this.userRepository.create({
      email: signupData.email.toLowerCase(),
      passwordHash,
      name: signupData.name,
      username: signupData.username || this.generateUsername(signupData.email),
      emailVerified: false,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const verificationToken = await this.generateEmailVerificationToken(user.id);
    await this.emailService.sendWelcomeEmail(user.email, user.name, verificationToken);

    const tokens = await this.generateAuthTokens(user);

    await this.createSession(user.id, tokens.refreshToken!, {
      userAgent: 'signup',
      ipAddress: '127.0.0.1',
    });

    this.eventEmitter.emit('user.signup', { userId: user.id });

    delete user.passwordHash;

    return { user, tokens };
  }

  async login(credentials: LoginDto, context: LoginContext): Promise<AuthResult> {
    const { email, password, rememberMe } = credentials;

    await this.checkLoginAttempts(email);

    const user = await this.userRepository.findByEmail(email.toLowerCase());
    if (!user) {
      await this.recordFailedLoginAttempt(email);
      throw new AppError('Invalid credentials', 401);
    }

    if (!user.isActive) {
      throw new AppError('Account is deactivated', 403);
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      await this.recordFailedLoginAttempt(email);
      throw new AppError('Invalid credentials', 401);
    }

    await this.clearFailedLoginAttempts(email);

    const isSuspicious = await this.securityService.checkSuspiciousActivity(user.id, context);
    if (isSuspicious) {
      await this.handleSuspiciousLogin(user, context);
    }

    const tokens = await this.generateAuthTokens(user, rememberMe);

    await this.createSession(user.id, tokens.refreshToken!, context);

    await this.userRepository.updateLastLogin(user.id, context.ipAddress);

    this.eventEmitter.emit('user.login', { userId: user.id, context });

    delete user.passwordHash;

    return { user, tokens };
  }

  async logout(userId: string, sessionId: string): Promise<void> {
    await this.sessionRepository.revokeSession(sessionId);
    await this.tokenService.blacklistSession(sessionId);
    await this.cacheService.delete(`user:${userId}`);
    await this.cacheService.delete(`session:${sessionId}`);
    this.eventEmitter.emit('user.logout', { userId, sessionId });
  }

  async refreshTokens(refreshToken: string): Promise<AuthResult> {
    const payload = await this.tokenService.verifyRefreshToken(refreshToken);
    if (!payload) {
      throw new AppError('Invalid refresh token', 401);
    }

    const isBlacklisted = await this.tokenService.isTokenBlacklisted(refreshToken);
    if (isBlacklisted) {
      throw new AppError('Token has been revoked', 401);
    }

    const session = await this.sessionRepository.findById(payload.sessionId);
    if (!session || !session.isActive || session.expiresAt < new Date()) {
      throw new AppError('Session expired', 401);
    }

    const user = await this.userRepository.findById(payload.userId);
    if (!user || !user.isActive) {
      throw new AppError('User not found or inactive', 401);
    }

    const tokens = await this.generateAuthTokens(user);

    await this.sessionRepository.updateSession(session.id, {
      lastAccessedAt: new Date(),
      refreshToken: tokens.refreshToken,
    });

    delete user.passwordHash;

    return { user, tokens };
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.userRepository.findByEmail(email.toLowerCase());
    if (!user) {
      return;
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    await this.userRepository.savePasswordResetToken(user.id, hashedToken, new Date(Date.now() + this.PASSWORD_RESET_TOKEN_EXPIRY));

    await this.emailService.sendPasswordResetEmail(user.email, user.name, resetToken);

    this.eventEmitter.emit('user.password_reset_requested', { userId: user.id });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await this.userRepository.findByPasswordResetToken(hashedToken);
    if (!user || !user.passwordResetExpires || user.passwordResetExpires < new Date()) {
      throw new AppError('Invalid or expired reset token', 400);
    }

    this.validatePasswordStrength(newPassword);

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.userRepository.updatePassword(user.id, passwordHash);
    await this.userRepository.clearPasswordResetToken(user.id);

    await this.sessionRepository.revokeAllUserSessions(user.id);

    await this.emailService.sendPasswordChangedEmail(user.email, user.name);

    this.eventEmitter.emit('user.password_reset', { userId: user.id });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isPasswordValid) {
      throw new AppError('Current password is incorrect', 401);
    }

    this.validatePasswordStrength(newPassword);

    const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);
    if (isSamePassword) {
      throw new AppError('New password must be different from current password', 400);
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.userRepository.updatePassword(userId, passwordHash);

    await this.emailService.sendPasswordChangedEmail(user.email, user.name);

    this.eventEmitter.emit('user.password_changed', { userId });
  }

  async getCurrentUser(userId: string): Promise<any> {
    const cached = await this.cacheService.get(`user:${userId}`);
    if (cached) {
      return cached;
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    delete user.passwordHash;
    delete user.passwordResetToken;
    delete user.passwordResetExpires;

    await this.cacheService.set(`user:${userId}`, user, 300);

    return user;
  }

  async updateProfile(userId: string, updates: any): Promise<any> {
    const allowedFields = ['name', 'username', 'avatar', 'bio', 'timezone'];
    const filteredUpdates = Object.keys(updates)
      .filter(key => allowedFields.includes(key))
      .reduce((obj, key) => ({ ...obj, [key]: updates[key] }), {} as any);

    if (filteredUpdates.username) {
      const existing = await this.userRepository.findByUsername(filteredUpdates.username);
      if (existing && existing.id !== userId) {
        throw new AppError('Username already taken', 409);
      }
    }

    const user = await this.userRepository.update(userId, {
      ...filteredUpdates,
      updatedAt: new Date(),
    });

    await this.cacheService.delete(`user:${userId}`);

    delete user.passwordHash;

    return user;
  }

  async getUserSessions(userId: string): Promise<any[]> {
    const sessions = await this.sessionRepository.findUserSessions(userId);
    return sessions.map(session => ({
      id: session.id,
      device: session.userAgent,
      ipAddress: session.ipAddress,
      location: session.location,
      createdAt: session.createdAt,
      lastAccessedAt: session.lastAccessedAt,
      isActive: session.isActive,
      isCurrent: session.isCurrent,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.sessionRepository.findById(sessionId);
    if (!session || session.userId !== userId) {
      throw new AppError('Session not found', 404);
    }

    await this.sessionRepository.revokeSession(sessionId);
    await this.tokenService.blacklistSession(sessionId);
  }

  private async generateAuthTokens(user: any, rememberMe: boolean = false): Promise<{ accessToken: string; refreshToken?: string }> {
    const sessionId = crypto.randomUUID();

    const accessToken = await this.tokenService.generateAccessToken({
      userId: user.id,
      email: user.email,
      roles: user.roles || [],
      sessionId,
    });

    let refreshToken;
    if (rememberMe) {
      refreshToken = await this.tokenService.generateRefreshToken({
        userId: user.id,
        sessionId,
      });
    }

    return { accessToken, refreshToken };
  }

  private async createSession(userId: string, refreshToken: string, context: LoginContext): Promise<void> {
    const location = await this.securityService.getLocationFromIP(context.ipAddress);

    await this.sessionRepository.create({
      userId,
      refreshToken,
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
      deviceFingerprint: context.deviceFingerprint,
      location,
      isActive: true,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      expiresAt: new Date(Date.now() + this.SESSION_DURATION),
    });
  }

  private async checkLoginAttempts(email: string): Promise<void> {
    const attempts = await this.cacheService.get(`login_attempts:${email}`);
    if (attempts && attempts >= this.MAX_LOGIN_ATTEMPTS) {
      const lockoutEnd = await this.cacheService.get(`login_lockout:${email}`);
      if (lockoutEnd && new Date(lockoutEnd) > new Date()) {
        throw new AppError('Account temporarily locked due to too many failed attempts', 429);
      }
    }
  }

  private async recordFailedLoginAttempt(email: string): Promise<void> {
    const key = `login_attempts:${email}`;
    const attempts = ((await this.cacheService.get(key)) || 0) + 1;

    await this.cacheService.set(key, attempts, 3600);

    if (attempts >= this.MAX_LOGIN_ATTEMPTS) {
      await this.cacheService.set(`login_lockout:${email}`, new Date(Date.now() + this.LOCKOUT_DURATION), this.LOCKOUT_DURATION / 1000);
    }
  }

  private async clearFailedLoginAttempts(email: string): Promise<void> {
    await this.cacheService.delete(`login_attempts:${email}`);
    await this.cacheService.delete(`login_lockout:${email}`);
  }

  private async handleSuspiciousLogin(user: any, context: LoginContext): Promise<void> {
    await this.emailService.sendSecurityAlert(user.email, user.name, {
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      timestamp: new Date(),
    });

    this.eventEmitter.emit('security.suspicious_login', { userId: user.id, context });
  }

  private validatePasswordStrength(password: string): void {
    if (password.length < 8) {
      throw new AppError('Password must be at least 8 characters long', 400);
    }

    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (!(hasUpperCase && hasLowerCase && hasNumbers)) {
      throw new AppError('Password must contain uppercase, lowercase, and numbers', 400);
    }

    const commonPasswords = ['password', '12345678', 'qwerty', 'abc12345'];
    if (commonPasswords.includes(password.toLowerCase())) {
      throw new AppError('Password is too common', 400);
    }
  }

  private generateUsername(email: string): string {
    const baseUsername = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${baseUsername}${Math.floor(Math.random() * 1000)}`;
  }

  private async generateEmailVerificationToken(userId: string): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    await this.userRepository.saveEmailVerificationToken(userId, hashedToken);

    return token;
  }
}
