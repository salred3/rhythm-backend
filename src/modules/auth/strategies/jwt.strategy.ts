import * as jwt from 'jsonwebtoken';
import { Request } from 'express';
import { UserRepository } from '../../users/user.repository';
import { CacheService } from '../../../common/services/cache.service';
import { AppError } from '../../../common/exceptions/app.error';

export interface JwtPayload {
  userId: string;
  email: string;
  roles: string[];
  sessionId: string;
  iat?: number;
  exp?: number;
}

export class JwtStrategy {
  private userRepository = new UserRepository();
  private cacheService = new CacheService();

  private readonly accessTokenSecret = process.env.JWT_ACCESS_SECRET || 'your-access-secret-key';
  private readonly refreshTokenSecret = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
  private readonly accessTokenExpiry = process.env.JWT_ACCESS_EXPIRY || '15m';
  private readonly refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRY || '30d';

  async validate(req: Request): Promise<any> {
    try {
      const token = this.extractTokenFromHeader(req);
      if (!token) {
        throw new AppError('No token provided', 401);
      }

      const isBlacklisted = await this.isTokenBlacklisted(token);
      if (isBlacklisted) {
        throw new AppError('Token has been revoked', 401);
      }

      const payload = jwt.verify(token, this.accessTokenSecret) as JwtPayload;

      const isSessionValid = await this.validateSession(payload.sessionId);
      if (!isSessionValid) {
        throw new AppError('Session expired or invalid', 401);
      }

      const user = await this.getUser(payload.userId);
      if (!user || !user.isActive) {
        throw new AppError('User not found or inactive', 401);
      }

      return {
        id: user.id,
        email: user.email,
        roles: user.roles || [],
        sessionId: payload.sessionId,
      };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError('Token expired', 401);
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AppError('Invalid token', 401);
      }
      throw error;
    }
  }

  verify(token: string): boolean {
    try {
      jwt.verify(token, this.accessTokenSecret);
      return true;
    } catch {
      return false;
    }
  }

  async generateAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): Promise<string> {
    return jwt.sign(payload, this.accessTokenSecret, {
      expiresIn: this.accessTokenExpiry,
      issuer: 'rhythm-app',
      audience: 'rhythm-users',
    });
  }

  async generateRefreshToken(payload: { userId: string; sessionId: string }): Promise<string> {
    return jwt.sign(payload, this.refreshTokenSecret, {
      expiresIn: this.refreshTokenExpiry,
      issuer: 'rhythm-app',
      audience: 'rhythm-users',
    });
  }

  async verifyRefreshToken(token: string): Promise<any> {
    try {
      return jwt.verify(token, this.refreshTokenSecret);
    } catch {
      return null;
    }
  }

  private extractTokenFromHeader(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }

  private async isTokenBlacklisted(token: string): Promise<boolean> {
    const blacklisted = await this.cacheService.get(`blacklist:${token}`);
    return !!blacklisted;
  }

  private async validateSession(sessionId: string): Promise<boolean> {
    const cached = await this.cacheService.get(`session:${sessionId}`);
    if (cached === false) {
      return false;
    }
    if (cached === true) {
      return true;
    }

    const SessionRepository = require('../repositories/session.repository').SessionRepository;
    const sessionRepo = new SessionRepository();
    const session = await sessionRepo.findById(sessionId);

    if (!session || !session.isActive || session.expiresAt < new Date()) {
      await this.cacheService.set(`session:${sessionId}`, false, 300);
      return false;
    }

    await this.cacheService.set(`session:${sessionId}`, true, 300);
    return true;
  }

  private async getUser(userId: string): Promise<any> {
    const cached = await this.cacheService.get(`user:${userId}`);
    if (cached) {
      return cached;
    }

    const user = await this.userRepository.findById(userId);
    if (user) {
      const { passwordHash, ...safeUser } = user;
      await this.cacheService.set(`user:${userId}`, safeUser, 300);
      return safeUser;
    }

    return null;
  }
}
