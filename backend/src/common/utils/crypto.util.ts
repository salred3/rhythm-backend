import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { promisify } from 'util';

const randomBytes = promisify(crypto.randomBytes);

export class CryptoUtil {
  private static readonly algorithm = 'aes-256-gcm';
  private static readonly saltRounds = 12;
  private static readonly ivLength = 16;
  private static readonly tagLength = 16;
  private static readonly keyLength = 32;

  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  static async generateToken(length = 32): Promise<string> {
    const buffer = await randomBytes(length);
    return buffer.toString('base64url');
  }

  static generateTokenSync(length = 32): string {
    return crypto.randomBytes(length).toString('base64url');
  }

  static async generateHexToken(length = 32): Promise<string> {
    const buffer = await randomBytes(length);
    return buffer.toString('hex');
  }

  static async generateSecureRandom(length: number, encoding: BufferEncoding = 'hex'): Promise<string> {
    const buffer = await randomBytes(length);
    return buffer.toString(encoding);
  }

  static generateUUID(): string {
    return crypto.randomUUID();
  }

  static generateShortId(length = 8): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const bytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
      result += chars[bytes[i] % chars.length];
    }
    return result;
  }

  static async encrypt(text: string, key?: string): Promise<string> {
    const encryptionKey = key || process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error('Encryption key not provided');
    }
    const keyBuffer = crypto.scryptSync(encryptionKey, 'salt', this.keyLength);
    const iv = await randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, keyBuffer, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const combined = Buffer.concat([iv, tag, encrypted]);
    return combined.toString('base64');
  }

  static async decrypt(encryptedData: string, key?: string): Promise<string> {
    const encryptionKey = key || process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error('Encryption key not provided');
    }
    const keyBuffer = crypto.scryptSync(encryptionKey, 'salt', this.keyLength);
    const combined = Buffer.from(encryptedData, 'base64');
    const iv = combined.slice(0, this.ivLength);
    const tag = combined.slice(this.ivLength, this.ivLength + this.tagLength);
    const encrypted = combined.slice(this.ivLength + this.tagLength);
    const decipher = crypto.createDecipheriv(this.algorithm, keyBuffer, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  }

  static hash(data: string, algorithm = 'sha256'): string {
    return crypto.createHash(algorithm).update(data).digest('hex');
  }

  static hmac(data: string, secret: string, algorithm = 'sha256'): string {
    return crypto.createHmac(algorithm, secret).update(data).digest('hex');
  }

  static generateOTP(length = 6): string {
    const digits = '0123456789';
    let otp = '';
    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, digits.length);
      otp += digits[randomIndex];
    }
    return otp;
  }

  static async generateTOTP(secret: string, window = 30, digits = 6): Promise<string> {
    const counter = Math.floor(Date.now() / 1000 / window);
    const buffer = Buffer.allocUnsafe(8);
    buffer.writeBigInt64BE(BigInt(counter));
    const hmac = crypto.createHmac('sha1', Buffer.from(secret, 'base32'));
    hmac.update(buffer);
    const hash = hmac.digest();
    const offset = hash[hash.length - 1] & 0xf;
    const truncated = hash.readUInt32BE(offset) & 0x7fffffff;
    const otp = truncated % Math.pow(10, digits);
    return otp.toString().padStart(digits, '0');
  }

  static generateApiKey(prefix = 'sk'): string {
    const timestamp = Date.now().toString(36);
    const random = this.generateTokenSync(24);
    return `${prefix}_${timestamp}_${random}`;
  }

  static signData(data: string, secret: string): string {
    return this.hmac(data, secret);
  }

  static verifySignature(data: string, signature: string, secret: string): boolean {
    const expectedSignature = this.signData(data, secret);
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  }

  static checkPasswordStrength(password: string): { score: number; feedback: string[]; isStrong: boolean } {
    const feedback: string[] = [];
    let score = 0;
    if (password.length >= 8) score++; else feedback.push('Password should be at least 8 characters long');
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password)) score++; else feedback.push('Add lowercase letters');
    if (/[A-Z]/.test(password)) score++; else feedback.push('Add uppercase letters');
    if (/[0-9]/.test(password)) score++; else feedback.push('Add numbers');
    if (/[^a-zA-Z0-9]/.test(password)) score++; else feedback.push('Add special characters');
    if (!/(.)\1{2,}/.test(password)) score++; else feedback.push('Avoid repeating characters');
    return { score, feedback, isStrong: score >= 5 };
  }

  static maskSensitiveData(data: string, visibleChars = 4): string {
    if (data.length <= visibleChars * 2) {
      return '*'.repeat(data.length);
    }
    const start = data.substring(0, visibleChars);
    const end = data.substring(data.length - visibleChars);
    const masked = '*'.repeat(Math.max(4, data.length - visibleChars * 2));
    return `${start}${masked}${end}`;
  }

  static maskEmail(email: string): string {
    const [localPart, domain] = email.split('@');
    if (!domain) return this.maskSensitiveData(email);
    const maskedLocal = localPart.length > 2
      ? localPart[0] + '*'.repeat(localPart.length - 2) + localPart[localPart.length - 1]
      : '*'.repeat(localPart.length);
    return `${maskedLocal}@${domain}`;
  }
}

