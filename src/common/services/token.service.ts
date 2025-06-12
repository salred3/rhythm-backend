import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';

export interface TokenPayload {
  [key: string]: any;
}

export interface TokenOptions {
  expiresIn?: string | number;
  issuer?: string;
  audience?: string;
  subject?: string;
}

/**
 * Service for generating and validating various types of tokens
 */
export class TokenService {
  private jwtSecret: string;
  private jwtIssuer: string;

  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    this.jwtIssuer = process.env.JWT_ISSUER || 'rhythm-app';
  }

  /**
   * Generate a secure random token
   */
  generateRandomToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate a URL-safe random token
   */
  generateUrlSafeToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('base64url');
  }

  /**
   * Generate a short code (e.g., for 2FA)
   */
  generateShortCode(length: number = 6): string {
    const chars = '0123456789';
    let code = '';
    
    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, chars.length);
      code += chars[randomIndex];
    }
    
    return code;
  }

  /**
   * Generate a JWT token
   */
  generateJWT(payload: TokenPayload, options: TokenOptions = {}): string {
    const defaultOptions: jwt.SignOptions = {
      expiresIn: options.expiresIn || '7d',
      issuer: options.issuer || this.jwtIssuer,
      audience: options.audience,
      subject: options.subject
    };

    return jwt.sign(payload, this.jwtSecret, defaultOptions);
  }

  /**
   * Verify and decode a JWT token
   */
  verifyJWT(token: string, options: TokenOptions = {}): TokenPayload {
    const verifyOptions: jwt.VerifyOptions = {
      issuer: options.issuer || this.jwtIssuer,
      audience: options.audience,
      subject: options.subject
    };

    try {
      return jwt.verify(token, this.jwtSecret, verifyOptions) as TokenPayload;
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  /**
   * Generate a hash of a token (for storing in database)
   */
  hashToken(token: string): string {
    return crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
  }

  /**
   * Compare a token with its hash
   */
  compareTokenHash(token: string, hash: string): boolean {
    const tokenHash = this.hashToken(token);
    return crypto.timingSafeEqual(
      Buffer.from(tokenHash),
      Buffer.from(hash)
    );
  }

  /**
   * Generate an invitation token with metadata
   */
  generateInvitationToken(metadata: {
    companyId: string;
    email: string;
    role: string;
  }): { token: string; hashedToken: string } {
    const token = this.generateUrlSafeToken(32);
    const hashedToken = this.hashToken(token);
    
    // Optionally, you could embed metadata in a JWT
    // For now, we use a simple random token
    
    return { token, hashedToken };
  }

  /**
   * Generate a password reset token
   */
  generatePasswordResetToken(userId: string): string {
    return this.generateJWT(
      { userId, type: 'password_reset' },
      { expiresIn: '1h', subject: userId }
    );
  }

  /**
   * Generate an email verification token
   */
  generateEmailVerificationToken(userId: string, email: string): string {
    return this.generateJWT(
      { userId, email, type: 'email_verification' },
      { expiresIn: '24h', subject: userId }
    );
  }

  /**
   * Generate an API key
   */
  generateApiKey(prefix: string = 'rhy'): string {
    const key = this.generateRandomToken(24);
    return `${prefix}_${key}`;
  }

  /**
   * Generate a refresh token
   */
  generateRefreshToken(userId: string): string {
    return this.generateJWT(
      { userId, type: 'refresh' },
      { expiresIn: '30d', subject: userId }
    );
  }

  /**
   * Generate an access token
   */
  generateAccessToken(userId: string, permissions: string[] = []): string {
    return this.generateJWT(
      { 
        userId, 
        type: 'access',
        permissions 
      },
      { expiresIn: '15m', subject: userId }
    );
  }

  /**
   * Decode a JWT without verification (use with caution)
   */
  decodeJWT(token: string): TokenPayload | null {
    try {
      return jwt.decode(token) as TokenPayload;
    } catch {
      return null;
    }
  }

  /**
   * Check if a token is expired
   */
  isTokenExpired(token: string): boolean {
    try {
      const decoded = this.decodeJWT(token);
      if (!decoded || !decoded.exp) {
        return true;
      }
      
      const expirationTime = decoded.exp * 1000; // Convert to milliseconds
      return Date.now() > expirationTime;
    } catch {
      return true;
    }
  }

  /**
   * Generate a CSRF token
   */
  generateCSRFToken(): string {
    return this.generateUrlSafeToken(16);
  }

  /**
   * Generate a session ID
   */
  generateSessionId(): string {
    return `sess_${this.generateUrlSafeToken(24)}`;
  }
}

