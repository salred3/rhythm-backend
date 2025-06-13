import { config } from './app.config';

interface AuthConfig {
  jwt: {
    secret: string;
    refreshSecret: string;
    expiresIn: string;
    refreshExpiresIn: string;
    algorithm: string;
    issuer: string;
    audience: string;
  };
  session: {
    name: string;
    secret: string;
    maxAge: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'strict' | 'lax' | 'none';
    domain?: string;
  };
  password: {
    minLength: number;
    maxLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSymbols: boolean;
    preventCommon: boolean;
    historyCount: number;
    expiryDays?: number;
    bcryptRounds: number;
  };
  mfa: {
    enabled: boolean;
    issuer: string;
    window: number;
    backupCodes: number;
    gracePeriod: number;
  };
  oauth: {
    google: {
      enabled: boolean;
      clientId: string;
      clientSecret: string;
      callbackUrl: string;
    };
    github: {
      enabled: boolean;
      clientId: string;
      clientSecret: string;
      callbackUrl: string;
    };
    microsoft: {
      enabled: boolean;
      clientId: string;
      clientSecret: string;
      callbackUrl: string;
    };
  };
  security: {
    maxLoginAttempts: number;
    lockoutDuration: number;
    tokenRotation: boolean;
    requireEmailVerification: boolean;
    allowPasswordReset: boolean;
    passwordResetExpiry: number;
    magicLinkExpiry: number;
    rememberMeDuration: number;
  };
  cors: {
    credentials: boolean;
    allowedHeaders: string[];
    exposedHeaders: string[];
    maxAge: number;
  };
}

class AuthConfiguration {
  private static instance: AuthConfiguration;
  private config: AuthConfig;

  private constructor() {
    this.config = this.loadConfiguration();
    this.validateConfiguration();
  }

  static getInstance(): AuthConfiguration {
    if (!this.instance) {
      this.instance = new AuthConfiguration();
    }
    return this.instance;
  }

  private loadConfiguration(): AuthConfig {
    const isProduction = config.isProduction();
    const appUrl = config.get('urls.api');
    return {
      jwt: {
        secret: process.env.JWT_SECRET || config.get('security.jwtSecret'),
        refreshSecret: process.env.JWT_REFRESH_SECRET || config.get('security.jwtRefreshSecret'),
        expiresIn: process.env.JWT_EXPIRES_IN || '15m',
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
        algorithm: process.env.JWT_ALGORITHM || 'HS256',
        issuer: process.env.JWT_ISSUER || 'rhythm-api',
        audience: process.env.JWT_AUDIENCE || 'rhythm-app'
      },
      session: {
        name: process.env.SESSION_NAME || 'rhythm.sid',
        secret: process.env.SESSION_SECRET || config.get('security.cookieSecret'),
        maxAge: parseInt(process.env.SESSION_MAX_AGE || '86400000', 10),
        httpOnly: process.env.SESSION_HTTP_ONLY !== 'false',
        secure: process.env.SESSION_SECURE === 'true' || isProduction,
        sameSite: (process.env.SESSION_SAME_SITE as any) || 'lax',
        domain: process.env.SESSION_DOMAIN
      },
      password: {
        minLength: parseInt(process.env.PASSWORD_MIN_LENGTH || '8', 10),
        maxLength: parseInt(process.env.PASSWORD_MAX_LENGTH || '128', 10),
        requireUppercase: process.env.PASSWORD_REQUIRE_UPPERCASE !== 'false',
        requireLowercase: process.env.PASSWORD_REQUIRE_LOWERCASE !== 'false',
        requireNumbers: process.env.PASSWORD_REQUIRE_NUMBERS !== 'false',
        requireSymbols: process.env.PASSWORD_REQUIRE_SYMBOLS !== 'false',
        preventCommon: process.env.PASSWORD_PREVENT_COMMON !== 'false',
        historyCount: parseInt(process.env.PASSWORD_HISTORY_COUNT || '5', 10),
        expiryDays: process.env.PASSWORD_EXPIRY_DAYS ? parseInt(process.env.PASSWORD_EXPIRY_DAYS, 10) : undefined,
        bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10)
      },
      mfa: {
        enabled: process.env.MFA_ENABLED === 'true',
        issuer: process.env.MFA_ISSUER || 'Rhythm',
        window: parseInt(process.env.MFA_WINDOW || '30', 10),
        backupCodes: parseInt(process.env.MFA_BACKUP_CODES || '10', 10),
        gracePeriod: parseInt(process.env.MFA_GRACE_PERIOD || '300', 10)
      },
      oauth: {
        google: {
          enabled: process.env.GOOGLE_OAUTH_ENABLED === 'true',
          clientId: process.env.GOOGLE_CLIENT_ID || '',
          clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
          callbackUrl: process.env.GOOGLE_CALLBACK_URL || `${appUrl}/auth/google/callback`
        },
        github: {
          enabled: process.env.GITHUB_OAUTH_ENABLED === 'true',
          clientId: process.env.GITHUB_CLIENT_ID || '',
          clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
          callbackUrl: process.env.GITHUB_CALLBACK_URL || `${appUrl}/auth/github/callback`
        },
        microsoft: {
          enabled: process.env.MICROSOFT_OAUTH_ENABLED === 'true',
          clientId: process.env.MICROSOFT_CLIENT_ID || '',
          clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
          callbackUrl: process.env.MICROSOFT_CALLBACK_URL || `${appUrl}/auth/microsoft/callback`
        }
      },
      security: {
        maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10),
        lockoutDuration: parseInt(process.env.LOCKOUT_DURATION || '900000', 10),
        tokenRotation: process.env.TOKEN_ROTATION !== 'false',
        requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION === 'true',
        allowPasswordReset: process.env.ALLOW_PASSWORD_RESET !== 'false',
        passwordResetExpiry: parseInt(process.env.PASSWORD_RESET_EXPIRY || '3600000', 10),
        magicLinkExpiry: parseInt(process.env.MAGIC_LINK_EXPIRY || '900000', 10),
        rememberMeDuration: parseInt(process.env.REMEMBER_ME_DURATION || '2592000000', 10)
      },
      cors: {
        credentials: true,
        allowedHeaders: [
          'Content-Type',
          'Authorization',
          'X-Requested-With',
          'X-Correlation-ID',
          'X-CSRF-Token'
        ],
        exposedHeaders: [
          'X-Correlation-ID',
          'X-RateLimit-Limit',
          'X-RateLimit-Remaining',
          'X-RateLimit-Reset'
        ],
        maxAge: 86400
      }
    };
  }

  private validateConfiguration(): void {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!this.config.jwt.secret || this.config.jwt.secret.length < 32) {
      errors.push('JWT secret must be at least 32 characters');
    }
    if (!this.config.jwt.refreshSecret || this.config.jwt.refreshSecret.length < 32) {
      errors.push('JWT refresh secret must be at least 32 characters');
    }
    if (this.config.password.minLength < 8) {
      warnings.push('Password minimum length is less than recommended 8 characters');
    }
    if (this.config.password.bcryptRounds < 10) {
      warnings.push('Bcrypt rounds is less than recommended 10');
    }
    Object.entries(this.config.oauth).forEach(([provider, settings]) => {
      if (settings.enabled && (!settings.clientId || !settings.clientSecret)) {
        errors.push(`OAuth provider ${provider} is enabled but missing credentials`);
      }
    });
    if (config.isProduction()) {
      if (!this.config.session.secure) {
        errors.push('Session cookies must be secure in production');
      }
      if (!this.config.security.requireEmailVerification) {
        warnings.push('Email verification is disabled in production');
      }
      if (this.config.jwt.expiresIn === '24h' || this.config.jwt.expiresIn === '1d') {
        warnings.push('JWT expiry is quite long for production');
      }
    }
    warnings.forEach(warning => console.warn(`⚠️  Auth Configuration Warning: ${warning}`));
    if (errors.length > 0) {
      throw new Error(`Auth configuration errors:\n${errors.join('\n')}`);
    }
  }

  get<T = any>(path: string, defaultValue?: T): T {
    return path.split('.').reduce((obj, key) => (obj as any)?.[key], this.config as any) ?? defaultValue;
  }

  getJwtConfig() {
    return { ...this.config.jwt };
  }

  getSessionConfig() {
    return { ...this.config.session };
  }

  getPasswordPolicy() {
    return { ...this.config.password };
  }

  getMfaConfig() {
    return { ...this.config.mfa };
  }

  getOAuthProvider(provider: keyof AuthConfig['oauth']) {
    return this.config.oauth[provider];
  }

  isOAuthProviderEnabled(provider: keyof AuthConfig['oauth']): boolean {
    return this.config.oauth[provider]?.enabled === true;
  }

  getEnabledOAuthProviders(): string[] {
    return Object.entries(this.config.oauth)
      .filter(([_, config]) => config.enabled)
      .map(([provider]) => provider);
  }

  getSecurityConfig() {
    return { ...this.config.security };
  }

  getCorsConfig() {
    return { ...this.config.cors };
  }

  isPasswordValid(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const policy = this.config.password;
    if (password.length < policy.minLength) {
      errors.push(`Password must be at least ${policy.minLength} characters`);
    }
    if (password.length > policy.maxLength) {
      errors.push(`Password must not exceed ${policy.maxLength} characters`);
    }
    if (policy.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (policy.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (policy.requireNumbers && !/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    if (policy.requireSymbols && !/[^A-Za-z0-9]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
    return { valid: errors.length === 0, errors };
  }
}

export const authConfig = AuthConfiguration.getInstance();

export const auth = {
  get: <T = any>(path: string, defaultValue?: T) => authConfig.get(path, defaultValue),
  jwt: () => authConfig.getJwtConfig(),
  session: () => authConfig.getSessionConfig(),
  password: () => authConfig.getPasswordPolicy(),
  mfa: () => authConfig.getMfaConfig(),
  oauth: (provider: keyof AuthConfig['oauth']) => authConfig.getOAuthProvider(provider),
  isOAuthEnabled: (provider: keyof AuthConfig['oauth']) => authConfig.isOAuthProviderEnabled(provider),
  enabledOAuthProviders: () => authConfig.getEnabledOAuthProviders(),
  security: () => authConfig.getSecurityConfig(),
  cors: () => authConfig.getCorsConfig(),
  validatePassword: (password: string) => authConfig.isPasswordValid(password)
};

