import { config } from './app.config';

interface DatabaseConfig {
  url: string;
  directUrl: string;
  shadowDatabaseUrl?: string;
  pool: {
    min: number;
    max: number;
    idleTimeout: number;
    acquireTimeout: number;
    createTimeout: number;
    destroyTimeout: number;
  };
  query: {
    timeout: number;
    slowQueryThreshold: number;
    retries: number;
    retryDelay: number;
  };
  migration: {
    directory: string;
    tableName: string;
    autoRun: boolean;
    validateChecksums: boolean;
  };
  logging: {
    enabled: boolean;
    level: 'query' | 'info' | 'warn' | 'error';
    slowQueryLogging: boolean;
  };
  backup: {
    enabled: boolean;
    schedule: string;
    retention: number;
    location: string;
  };
}

class DatabaseConfiguration {
  private static instance: DatabaseConfiguration;
  private config: DatabaseConfig;
  private constructor() {
    this.config = this.loadConfiguration();
    this.validateConfiguration();
  }
  static getInstance(): DatabaseConfiguration {
    if (!this.instance) {
      this.instance = new DatabaseConfiguration();
    }
    return this.instance;
  }
  private loadConfiguration(): DatabaseConfig {
    const isDevelopment = config.isDevelopment();
    const isProduction = config.isProduction();
    return {
      url: process.env.DATABASE_URL || '',
      directUrl: process.env.DIRECT_URL || process.env.DATABASE_URL || '',
      shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
      pool: {
        min: parseInt(process.env.DB_POOL_MIN || '2', 10),
        max: parseInt(process.env.DB_POOL_MAX || '10', 10),
        idleTimeout: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '10000', 10),
        acquireTimeout: parseInt(process.env.DB_POOL_ACQUIRE_TIMEOUT || '30000', 10),
        createTimeout: parseInt(process.env.DB_POOL_CREATE_TIMEOUT || '30000', 10),
        destroyTimeout: parseInt(process.env.DB_POOL_DESTROY_TIMEOUT || '5000', 10)
      },
      query: {
        timeout: parseInt(process.env.DB_QUERY_TIMEOUT || '30000', 10),
        slowQueryThreshold: parseInt(process.env.DB_SLOW_QUERY_THRESHOLD || '1000', 10),
        retries: parseInt(process.env.DB_QUERY_RETRIES || '3', 10),
        retryDelay: parseInt(process.env.DB_QUERY_RETRY_DELAY || '100', 10)
      },
      migration: {
        directory: process.env.DB_MIGRATION_DIR || './prisma/migrations',
        tableName: process.env.DB_MIGRATION_TABLE || '_prisma_migrations',
        autoRun: process.env.DB_MIGRATION_AUTO_RUN === 'true',
        validateChecksums: process.env.DB_MIGRATION_VALIDATE !== 'false'
      },
      logging: {
        enabled: process.env.DB_LOGGING_ENABLED !== 'false',
        level: (process.env.DB_LOGGING_LEVEL as any) || (isDevelopment ? 'query' : 'warn'),
        slowQueryLogging: process.env.DB_SLOW_QUERY_LOGGING !== 'false'
      },
      backup: {
        enabled: process.env.DB_BACKUP_ENABLED === 'true',
        schedule: process.env.DB_BACKUP_SCHEDULE || '0 3 * * *',
        retention: parseInt(process.env.DB_BACKUP_RETENTION || '7', 10),
        location: process.env.DB_BACKUP_LOCATION || './backups'
      }
    };
  }

  private validateConfiguration(): void {
    const errors: string[] = [];
    if (!this.config.url) {
      errors.push('DATABASE_URL is required');
    }
    if (this.config.url && !this.isValidConnectionString(this.config.url)) {
      errors.push('Invalid DATABASE_URL format');
    }
    if (this.config.pool.min > this.config.pool.max) {
      errors.push('DB_POOL_MIN cannot be greater than DB_POOL_MAX');
    }
    if (config.isProduction()) {
      if (this.config.pool.max < 5) {
        console.warn('⚠️  Low connection pool size for production');
      }
      if (!this.config.backup.enabled) {
        console.warn('⚠️  Database backups are disabled in production');
      }
      if (this.config.logging.level === 'query') {
        console.warn('⚠️  Query logging is enabled in production');
      }
    }
    if (errors.length > 0) {
      throw new Error(`Database configuration errors:\n${errors.join('\n')}`);
    }
  }

  private isValidConnectionString(url: string): boolean {
    try {
      const parsed = new URL(url);
      return ['postgresql:', 'postgres:', 'mysql:', 'mysql2:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  get<T = any>(path: string, defaultValue?: T): T {
    return path.split('.').reduce((obj, key) => (obj as any)?.[key], this.config as any) ?? defaultValue;
  }

  getConnectionUrl(): string {
    return this.config.url;
  }

  getDirectUrl(): string {
    return this.config.directUrl;
  }

  getPoolConfig() {
    return { ...this.config.pool };
  }

  getQueryConfig() {
    return { ...this.config.query };
  }

  getMigrationConfig() {
    return { ...this.config.migration };
  }

  getLoggingConfig() {
    return { ...this.config.logging };
  }

  isPrismaLoggingEnabled(): boolean {
    return this.config.logging.enabled;
  }

  getPrismaLogLevels(): string[] {
    const levels = ['error', 'warn'];
    if (this.config.logging.level === 'info' || this.config.logging.level === 'query') {
      levels.push('info');
    }
    if (this.config.logging.level === 'query') {
      levels.push('query');
    }
    return levels;
  }

  getSupabaseConfig() {
    return {
      url: process.env.SUPABASE_URL || '',
      anonKey: process.env.SUPABASE_ANON_KEY || '',
      serviceKey: process.env.SUPABASE_SERVICE_KEY || ''
    };
  }

  isSupabaseConfigured(): boolean {
    const supabase = this.getSupabaseConfig();
    return !!(supabase.url && supabase.anonKey && supabase.serviceKey);
  }
}

export const databaseConfig = DatabaseConfiguration.getInstance();

export const dbConfig = {
  get: <T = any>(path: string, defaultValue?: T) => databaseConfig.get(path, defaultValue),
  connectionUrl: () => databaseConfig.getConnectionUrl(),
  directUrl: () => databaseConfig.getDirectUrl(),
  pool: () => databaseConfig.getPoolConfig(),
  query: () => databaseConfig.getQueryConfig(),
  migration: () => databaseConfig.getMigrationConfig(),
  logging: () => databaseConfig.getLoggingConfig(),
  supabase: () => databaseConfig.getSupabaseConfig(),
  isSupabaseConfigured: () => databaseConfig.isSupabaseConfigured()
};

