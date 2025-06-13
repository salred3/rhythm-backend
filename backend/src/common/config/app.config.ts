/**
 * Application configuration
 */
import * as dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: join(__dirname, '../../../.env') });

interface AppConfig {
  env: string;
  name: string;
  version: string;
  port: number;
  host: string;
  apiPrefix: string;
  corsOrigins: string[];
  trustProxy: boolean;
  features: {
    ai: boolean;
    analytics: boolean;
    emailNotifications: boolean;
    pushNotifications: boolean;
    webhooks: boolean;
    apiDocs: boolean;
    maintenanceMode: boolean;
  };
  security: {
    jwtSecret: string;
    jwtRefreshSecret: string;
    jwtExpiresIn: string;
    jwtRefreshExpiresIn: string;
    encryptionKey: string;
    cookieSecret: string;
    rateLimitWindow: number;
    rateLimitMax: number;
  };
  services: {
    openaiApiKey?: string;
    stripeApiKey?: string;
    sendgridApiKey?: string;
    slackWebhookUrl?: string;
    sentryDsn?: string;
    googleMapsApiKey?: string;
  };
  urls: {
    frontend: string;
    api: string;
    cdn?: string;
    docs?: string;
  };
  limits: {
    maxFileSize: number;
    maxRequestSize: string;
    maxConcurrentJobs: number;
    maxApiCallsPerMinute: number;
    paginationDefault: number;
    paginationMax: number;
  };
}

class AppConfiguration {
  private static instance: AppConfiguration;
  private config: AppConfig;

  private constructor() {
    this.config = this.loadConfiguration();
    this.validateConfiguration();
  }

  static getInstance(): AppConfiguration {
    if (!this.instance) {
      this.instance = new AppConfiguration();
    }
    return this.instance;
  }

  private loadConfiguration(): AppConfig {
    return {
      env: process.env.NODE_ENV || 'development',
      name: process.env.APP_NAME || 'Rhythm',
      version: process.env.npm_package_version || '1.0.0',
      port: parseInt(process.env.PORT || '3001', 10),
      host: process.env.HOST || '0.0.0.0',
      apiPrefix: process.env.API_PREFIX || '/api',
      corsOrigins: this.parseArray(process.env.CORS_ORIGINS, ['http://localhost:3000']),
      trustProxy: process.env.TRUST_PROXY === 'true',
      features: {
        ai: process.env.ENABLE_AI === 'true',
        analytics: process.env.ENABLE_ANALYTICS !== 'false',
        emailNotifications: process.env.ENABLE_EMAIL_NOTIFICATIONS !== 'false',
        pushNotifications: process.env.ENABLE_PUSH_NOTIFICATIONS === 'true',
        webhooks: process.env.ENABLE_WEBHOOKS === 'true',
        apiDocs: process.env.ENABLE_API_DOCS !== 'false',
        maintenanceMode: process.env.MAINTENANCE_MODE === 'true'
      },
      security: {
        jwtSecret: process.env.JWT_SECRET || this.generateSecret(),
        jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || this.generateSecret(),
        jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
        jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
        encryptionKey: process.env.ENCRYPTION_KEY || this.generateSecret(),
        cookieSecret: process.env.COOKIE_SECRET || this.generateSecret(),
        rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '900000', 10),
        rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10)
      },
      services: {
        openaiApiKey: process.env.OPENAI_API_KEY,
        stripeApiKey: process.env.STRIPE_API_KEY,
        sendgridApiKey: process.env.SENDGRID_API_KEY,
        slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
        sentryDsn: process.env.SENTRY_DSN,
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY
      },
      urls: {
        frontend: process.env.FRONTEND_URL || 'http://localhost:3000',
        api: process.env.API_URL || 'http://localhost:3001',
        cdn: process.env.CDN_URL,
        docs: process.env.DOCS_URL
      },
      limits: {
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10),
        maxRequestSize: process.env.MAX_REQUEST_SIZE || '10mb',
        maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS || '10', 10),
        maxApiCallsPerMinute: parseInt(process.env.MAX_API_CALLS_PER_MINUTE || '60', 10),
        paginationDefault: parseInt(process.env.PAGINATION_DEFAULT || '20', 10),
        paginationMax: parseInt(process.env.PAGINATION_MAX || '100', 10)
      }
    };
  }

  private validateConfiguration(): void {
    const required = [
      'security.jwtSecret',
      'security.jwtRefreshSecret',
      'security.encryptionKey'
    ];
    const warnings: string[] = [];
    const errors: string[] = [];
    for (const field of required) {
      const value = this.getNestedValue(this.config, field);
      if (!value || value === this.generateSecret()) {
        if (this.config.env === 'production') {
          errors.push(`Missing required configuration: ${field}`);
        } else {
          warnings.push(`Using default value for: ${field}`);
        }
      }
    }
    if (this.config.env === 'production') {
      if (!this.config.services.sentryDsn) {
        warnings.push('Sentry DSN not configured for production');
      }
      if (this.config.features.apiDocs) {
        warnings.push('API documentation is enabled in production');
      }
      if (this.config.corsOrigins.includes('http://localhost:3000')) {
        warnings.push('Localhost is allowed in CORS origins for production');
      }
    }
    warnings.forEach(warning => console.warn(`⚠️  Configuration Warning: ${warning}`));
    if (errors.length > 0) {
      throw new Error(`Configuration errors:\n${errors.join('\n')}`);
    }
  }

  private parseArray(value?: string, defaultValue: string[] = []): string[] {
    if (!value) return defaultValue;
    return value.split(',').map(s => s.trim()).filter(Boolean);
  }

  private generateSecret(): string {
    if (this.config?.env === 'production') {
      throw new Error('Cannot use generated secrets in production');
    }
    return 'dev-secret-' + Math.random().toString(36).substring(7);
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  get<T = any>(path: string, defaultValue?: T): T {
    const value = this.getNestedValue(this.config, path);
    return value !== undefined ? value : defaultValue;
  }

  getAll(): AppConfig {
    return { ...this.config };
  }

  isProduction(): boolean {
    return this.config.env === 'production';
  }

  isDevelopment(): boolean {
    return this.config.env === 'development';
  }

  isTest(): boolean {
    return this.config.env === 'test';
  }

  isFeatureEnabled(feature: keyof AppConfig['features']): boolean {
    return this.config.features[feature] === true;
  }

  getServiceConfig(service: keyof AppConfig['services']): string | undefined {
    return this.config.services[service];
  }
}

export const appConfig = AppConfiguration.getInstance();

export const config = {
  get: <T = any>(path: string, defaultValue?: T) => appConfig.get(path, defaultValue),
  all: () => appConfig.getAll(),
  isProduction: () => appConfig.isProduction(),
  isDevelopment: () => appConfig.isDevelopment(),
  isTest: () => appConfig.isTest(),
  isFeatureEnabled: (feature: keyof AppConfig['features']) => appConfig.isFeatureEnabled(feature),
  getService: (service: keyof AppConfig['services']) => appConfig.getServiceConfig(service)
};

