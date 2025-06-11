import * as bcrypt from 'bcryptjs';
import { UserRepository } from '../../users/user.repository';
import { CacheService } from '../../../common/services/cache.service';
import { SecurityService } from '../services/security.service';
import { AppError } from '../../../common/exceptions/app.error';
import { EventEmitter } from 'events';

interface LoginAttempt {
  email: string;
  password: string;
  ipAddress: string;
  userAgent: string;
}

export class LocalStrategy {
  private userRepository = new UserRepository();
  private cacheService = new CacheService();
  private securityService = new SecurityService();
  private eventEmitter = new EventEmitter();

  private readonly MAX_LOGIN_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION = 30 * 60 * 1000;
  private readonly SLOW_DOWN_THRESHOLD = 3;
  private readonly SLOW_DOWN_DELAY = 2000;

  async validate(credentials: LoginAttempt): Promise<any> {
    const { email, password, ipAddress, userAgent } = credentials;

    await this.checkIPRateLimit(ipAddress);
    await this.checkAccountLockout(email);
    await this.addProgressiveDelay(email);

    const user = await this.userRepository.findByEmail(email.toLowerCase());
    if (!user) {
      await this.handleFailedLogin(email, ipAddress, 'User not found');
      throw new AppError('Invalid credentials', 401);
    }

    if (!user.isActive) {
      await this.logSecurityEvent('inactive_account_login', { email, ipAddress });
      throw new AppError('Account is deactivated', 403);
    }

    if (process.env.REQUIRE_EMAIL_VERIFICATION === 'true' && !user.emailVerified) {
      throw new AppError('Please verify your email before logging in', 403);
    }

    const isPasswordValid = await this.verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      await this.handleFailedLogin(email, ipAddress, 'Invalid password');
      throw new AppError('Invalid credentials', 401);
    }

    const suspiciousPatterns = await this.detectSuspiciousPatterns({
      userId: user.id,
      ipAddress,
      userAgent,
      email,
    });

    if (suspiciousPatterns.length > 0) {
      await this.handleSuspiciousLogin(user, suspiciousPatterns);
    }

    await this.clearFailedAttempts(email);
    await this.clearIPAttempts(ipAddress);

    await this.logSecurityEvent('successful_login', {
      userId: user.id,
      email,
      ipAddress,
      userAgent,
    });

    return user;
  }

  private async verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    try {
      return await bcrypt.compare(plainPassword, hashedPassword);
    } catch (error) {
      console.error('Password verification error:', error);
      return false;
    }
  }

  private async checkAccountLockout(email: string): Promise<void> {
    const lockoutKey = `lockout:${email}`;
    const lockoutEnd = await this.cacheService.get(lockoutKey);

    if (lockoutEnd && new Date(lockoutEnd) > new Date()) {
      const remainingTime = Math.ceil((new Date(lockoutEnd).getTime() - Date.now()) / 1000 / 60);
      throw new AppError(`Account locked. Try again in ${remainingTime} minutes.`, 429);
    }

    const attempts = await this.getFailedAttempts(email);
    if (attempts >= this.MAX_LOGIN_ATTEMPTS) {
      await this.lockAccount(email);
      throw new AppError('Account locked due to too many failed attempts', 429);
    }
  }

  private async checkIPRateLimit(ipAddress: string): Promise<void> {
    const key = `ip_attempts:${ipAddress}`;
    const attempts = (await this.cacheService.get(key)) || 0;

    if (attempts >= 20) {
      throw new AppError('Too many requests from this IP address', 429);
    }
  }

  private async addProgressiveDelay(email: string): Promise<void> {
    const attempts = await this.getFailedAttempts(email);
    if (attempts >= this.SLOW_DOWN_THRESHOLD) {
      const delay = this.SLOW_DOWN_DELAY * (attempts - this.SLOW_DOWN_THRESHOLD + 1);
      await new Promise(resolve => setTimeout(resolve, Math.min(delay, 10000)));
    }
  }

  private async handleFailedLogin(email: string, ipAddress: string, reason: string): Promise<void> {
    await this.incrementFailedAttempts(email);
    await this.incrementIPAttempts(ipAddress);

    await this.logSecurityEvent('failed_login', {
      email,
      ipAddress,
      reason,
      timestamp: new Date(),
    });

    const attempts = await this.getFailedAttempts(email);
    if (attempts === this.SLOW_DOWN_THRESHOLD || attempts === this.MAX_LOGIN_ATTEMPTS - 1) {
      const user = await this.userRepository.findByEmail(email);
      if (user) {
        this.eventEmitter.emit('security.failed_login_warning', {
          email: user.email,
          attempts,
          ipAddress,
        });
      }
    }
  }

  private async detectSuspiciousPatterns(context: any): Promise<string[]> {
    const patterns: string[] = [];

    const lastLogin = await this.getLastLoginLocation(context.userId);
    if (lastLogin) {
      const travelSpeed = await this.securityService.calculateTravelSpeed(
        lastLogin.location,
        context.ipAddress,
        lastLogin.timestamp
      );

      if (travelSpeed > 500) {
        patterns.push('impossible_travel');
      }
    }

    const isKnownDevice = await this.isKnownDevice(context.userId, context.userAgent);
    if (!isKnownDevice) {
      patterns.push('new_device');
    }

    const isKnownLocation = await this.isKnownLocation(context.userId, context.ipAddress);
    if (!isKnownLocation) {
      patterns.push('new_location');
    }

    const recentFailures = await this.getRecentFailedLoginsForIP(context.ipAddress);
    if (recentFailures > 10) {
      patterns.push('brute_force_pattern');
    }

    const uniqueAccountsTriedFromIP = await this.getUniqueAccountsTriedFromIP(context.ipAddress);
    if (uniqueAccountsTriedFromIP > 5) {
      patterns.push('credential_stuffing');
    }

    return patterns;
  }

  private async handleSuspiciousLogin(user: any, patterns: string[]): Promise<void> {
    await this.logSecurityEvent('suspicious_login', {
      userId: user.id,
      patterns,
      timestamp: new Date(),
    });

    this.eventEmitter.emit('security.suspicious_login', {
      user,
      patterns,
    });
  }

  private async getFailedAttempts(email: string): Promise<number> {
    const key = `failed_attempts:${email}`;
    return (await this.cacheService.get(key)) || 0;
  }

  private async incrementFailedAttempts(email: string): Promise<void> {
    const key = `failed_attempts:${email}`;
    const current = await this.getFailedAttempts(email);
    await this.cacheService.set(key, current + 1, 3600);
  }

  private async clearFailedAttempts(email: string): Promise<void> {
    await this.cacheService.delete(`failed_attempts:${email}`);
  }

  private async incrementIPAttempts(ipAddress: string): Promise<void> {
    const key = `ip_attempts:${ipAddress}`;
    const current = (await this.cacheService.get(key)) || 0;
    await this.cacheService.set(key, current + 1, 3600);
  }

  private async clearIPAttempts(ipAddress: string): Promise<void> {
    await this.cacheService.delete(`ip_attempts:${ipAddress}`);
  }

  private async lockAccount(email: string): Promise<void> {
    const lockoutKey = `lockout:${email}`;
    const lockoutEnd = new Date(Date.now() + this.LOCKOUT_DURATION);
    await this.cacheService.set(lockoutKey, lockoutEnd, this.LOCKOUT_DURATION / 1000);
  }

  private async getLastLoginLocation(userId: string): Promise<any> {
    return await this.cacheService.get(`last_login:${userId}`);
  }

  private async isKnownDevice(userId: string, userAgent: string): Promise<boolean> {
    const knownDevices = await this.cacheService.get(`known_devices:${userId}`) || [];
    return knownDevices.includes(userAgent);
  }

  private async isKnownLocation(userId: string, ipAddress: string): Promise<boolean> {
    const knownLocations = await this.cacheService.get(`known_locations:${userId}`) || [];
    const location = await this.securityService.getLocationFromIP(ipAddress);
    return knownLocations.some((loc: any) => loc.country === location.country);
  }

  private async getRecentFailedLoginsForIP(ipAddress: string): Promise<number> {
    const key = `recent_failures:${ipAddress}`;
    return (await this.cacheService.get(key)) || 0;
  }

  private async getUniqueAccountsTriedFromIP(ipAddress: string): Promise<number> {
    const key = `unique_accounts:${ipAddress}`;
    const accounts = (await this.cacheService.get(key)) || new Set();
    return accounts.size;
  }

  private async logSecurityEvent(event: string, data: any): Promise<void> {
    console.log(`[SECURITY] ${event}:`, data);
    this.eventEmitter.emit(`security.${event}`, data);
  }
}
