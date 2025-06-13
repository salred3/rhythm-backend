import { config } from './app.config';

interface QueueConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
    maxRetriesPerRequest: number;
    enableReadyCheck: boolean;
    connectTimeout: number;
    disconnectTimeout: number;
    commandTimeout: number;
    enableOfflineQueue: boolean;
  };
  queues: {
    default: QueueSettings;
    email: QueueSettings;
    scheduler: QueueSettings;
    analytics: QueueSettings;
    ai: QueueSettings;
    notifications: QueueSettings;
    exports: QueueSettings;
  };
  workers: {
    concurrency: number;
    maxStalledCount: number;
    stalledInterval: number;
    lockDuration: number;
    lockRenewTime: number;
  };
  jobs: {
    defaultDelay: number;
    defaultAttempts: number;
    backoffDelay: number;
    backoffType: 'fixed' | 'exponential';
    removeOnComplete: boolean | number;
    removeOnFail: boolean | number;
    stackTraceLimit: number;
  };
  monitoring: {
    enabled: boolean;
    collectMetrics: boolean;
    metricsInterval: number;
    healthCheckInterval: number;
  };
  rateLimiting: {
    max: number;
    duration: number;
    groupByKey?: string;
  };
}

interface QueueSettings {
  name: string;
  prefix: string;
  priority: number;
  concurrency: number;
  rateLimit?: {
    max: number;
    duration: number;
  };
  defaultJobOptions?: {
    attempts?: number;
    backoff?: {
      type: 'fixed' | 'exponential';
      delay: number;
    };
    delay?: number;
    removeOnComplete?: boolean | number;
    removeOnFail?: boolean | number;
  };
}

class QueueConfiguration {
  private static instance: QueueConfiguration;
  private config: QueueConfig;

  private constructor() {
    this.config = this.loadConfiguration();
    this.validateConfiguration();
  }

  static getInstance(): QueueConfiguration {
    if (!this.instance) {
      this.instance = new QueueConfiguration();
    }
    return this.instance;
  }

  private loadConfiguration(): QueueConfig {
    const redisUrl = process.env.REDIS_URL;
    let redisConfig = this.parseRedisUrl(redisUrl);
    return {
      redis: {
        host: redisConfig?.host || process.env.REDIS_HOST || 'localhost',
        port: redisConfig?.port || parseInt(process.env.REDIS_PORT || '6379', 10),
        password: redisConfig?.password || process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0', 10),
        maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES || '3', 10),
        enableReadyCheck: process.env.REDIS_READY_CHECK !== 'false',
        connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '10000', 10),
        disconnectTimeout: parseInt(process.env.REDIS_DISCONNECT_TIMEOUT || '2000', 10),
        commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '5000', 10),
        enableOfflineQueue: process.env.REDIS_OFFLINE_QUEUE !== 'false'
      },
      queues: {
        default: {
          name: 'default',
          prefix: 'rhythm:queue:default',
          priority: 0,
          concurrency: parseInt(process.env.DEFAULT_QUEUE_CONCURRENCY || '5', 10)
        },
        email: {
          name: 'email',
          prefix: 'rhythm:queue:email',
          priority: 2,
          concurrency: parseInt(process.env.EMAIL_QUEUE_CONCURRENCY || '3', 10),
          rateLimit: {
            max: parseInt(process.env.EMAIL_RATE_LIMIT || '30', 10),
            duration: parseInt(process.env.EMAIL_RATE_DURATION || '60000', 10)
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 5000
            },
            removeOnComplete: 100,
            removeOnFail: 500
          }
        },
        scheduler: {
          name: 'scheduler',
          prefix: 'rhythm:queue:scheduler',
          priority: 3,
          concurrency: parseInt(process.env.SCHEDULER_QUEUE_CONCURRENCY || '2', 10),
          defaultJobOptions: {
            attempts: 5,
            backoff: {
              type: 'exponential',
              delay: 1000
            }
          }
        },
        analytics: {
          name: 'analytics',
          prefix: 'rhythm:queue:analytics',
          priority: 1,
          concurrency: parseInt(process.env.ANALYTICS_QUEUE_CONCURRENCY || '4', 10),
          defaultJobOptions: {
            attempts: 3,
            removeOnComplete: true,
            removeOnFail: false
          }
        },
        ai: {
          name: 'ai',
          prefix: 'rhythm:queue:ai',
          priority: 2,
          concurrency: parseInt(process.env.AI_QUEUE_CONCURRENCY || '2', 10),
          rateLimit: {
            max: parseInt(process.env.AI_RATE_LIMIT || '100', 10),
            duration: parseInt(process.env.AI_RATE_DURATION || '60000', 10)
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000
            }
          }
        },
        notifications: {
          name: 'notifications',
          prefix: 'rhythm:queue:notifications',
          priority: 2,
          concurrency: parseInt(process.env.NOTIFICATION_QUEUE_CONCURRENCY || '5', 10),
          defaultJobOptions: {
            attempts: 3,
            removeOnComplete: 50,
            removeOnFail: 100
          }
        },
        exports: {
          name: 'exports',
          prefix: 'rhythm:queue:exports',
          priority: 1,
          concurrency: parseInt(process.env.EXPORT_QUEUE_CONCURRENCY || '2', 10),
          defaultJobOptions: {
            attempts: 2,
            backoff: {
              type: 'fixed',
              delay: 10000
            }
          }
        }
      },
      workers: {
        concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),
        maxStalledCount: parseInt(process.env.WORKER_MAX_STALLED_COUNT || '3', 10),
        stalledInterval: parseInt(process.env.WORKER_STALLED_INTERVAL || '30000', 10),
        lockDuration: parseInt(process.env.WORKER_LOCK_DURATION || '30000', 10),
        lockRenewTime: parseInt(process.env.WORKER_LOCK_RENEW_TIME || '15000', 10)
      },
      jobs: {
        defaultDelay: parseInt(process.env.JOB_DEFAULT_DELAY || '0', 10),
        defaultAttempts: parseInt(process.env.JOB_DEFAULT_ATTEMPTS || '3', 10),
        backoffDelay: parseInt(process.env.JOB_BACKOFF_DELAY || '5000', 10),
        backoffType: (process.env.JOB_BACKOFF_TYPE as any) || 'exponential',
        removeOnComplete: process.env.JOB_REMOVE_ON_COMPLETE === 'false' ? false : 100,
        removeOnFail: process.env.JOB_REMOVE_ON_FAIL === 'true' ? true : 1000,
        stackTraceLimit: parseInt(process.env.JOB_STACK_TRACE_LIMIT || '10', 10)
      },
      monitoring: {
        enabled: process.env.QUEUE_MONITORING_ENABLED !== 'false',
        collectMetrics: process.env.QUEUE_COLLECT_METRICS !== 'false',
        metricsInterval: parseInt(process.env.QUEUE_METRICS_INTERVAL || '60000', 10),
        healthCheckInterval: parseInt(process.env.QUEUE_HEALTH_CHECK_INTERVAL || '30000', 10)
      },
      rateLimiting: {
        max: parseInt(process.env.QUEUE_RATE_LIMIT_MAX || '1000', 10),
        duration: parseInt(process.env.QUEUE_RATE_LIMIT_DURATION || '60000', 10),
        groupByKey: process.env.QUEUE_RATE_LIMIT_GROUP_KEY
      }
    };
  }

  private parseRedisUrl(url?: string): { host: string; port: number; password?: string } | null {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      return {
        host: parsed.hostname,
        port: parseInt(parsed.port || '6379', 10),
        password: parsed.password || undefined
      };
    } catch {
      return null;
    }
  }

  private validateConfiguration(): void {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!this.config.redis.host) {
      errors.push('Redis host is required');
    }
    if (this.config.workers.lockRenewTime >= this.config.workers.lockDuration) {
      errors.push('Worker lock renew time must be less than lock duration');
    }
    Object.entries(this.config.queues).forEach(([queueName, settings]) => {
      if (settings.concurrency < 1) {
        errors.push(`Queue ${queueName} concurrency must be at least 1`);
      }
      if (settings.rateLimit && settings.rateLimit.max < 1) {
        errors.push(`Queue ${queueName} rate limit max must be at least 1`);
      }
    });
    if (config.isProduction()) {
      if (!this.config.redis.password) {
        warnings.push('Redis password is not set for production');
      }
      if (this.config.jobs.removeOnFail === true) {
        warnings.push('Failed jobs are being removed in production');
      }
      if (!this.config.monitoring.enabled) {
        warnings.push('Queue monitoring is disabled in production');
      }
    }
    warnings.forEach(warning => console.warn(`⚠️  Queue Configuration Warning: ${warning}`));
    if (errors.length > 0) {
      throw new Error(`Queue configuration errors:\n${errors.join('\n')}`);
    }
  }

  get<T = any>(path: string, defaultValue?: T): T {
    return path.split('.').reduce((obj, key) => (obj as any)?.[key], this.config as any) ?? defaultValue;
  }

  getRedisConfig() {
    return { ...this.config.redis };
  }

  getQueueConfig(queueName: keyof QueueConfig['queues']) {
    return { ...this.config.queues[queueName] };
  }

  getAllQueues() {
    return Object.keys(this.config.queues) as Array<keyof QueueConfig['queues']>;
  }

  getWorkerConfig() {
    return { ...this.config.workers };
  }

  getDefaultJobOptions() {
    return {
      attempts: this.config.jobs.defaultAttempts,
      backoff: {
        type: this.config.jobs.backoffType,
        delay: this.config.jobs.backoffDelay
      },
      removeOnComplete: this.config.jobs.removeOnComplete,
      removeOnFail: this.config.jobs.removeOnFail,
      stackTraceLimit: this.config.jobs.stackTraceLimit
    };
  }

  getMonitoringConfig() {
    return { ...this.config.monitoring };
  }

  getRateLimitConfig() {
    return { ...this.config.rateLimiting };
  }

  getBullRedisOptions() {
    return {
      host: this.config.redis.host,
      port: this.config.redis.port,
      password: this.config.redis.password,
      db: this.config.redis.db,
      maxRetriesPerRequest: this.config.redis.maxRetriesPerRequest,
      enableReadyCheck: this.config.redis.enableReadyCheck,
      connectTimeout: this.config.redis.connectTimeout,
      disconnectTimeout: this.config.redis.disconnectTimeout,
      commandTimeout: this.config.redis.commandTimeout,
      enableOfflineQueue: this.config.redis.enableOfflineQueue
    };
  }

  getBullQueueOptions(queueName: keyof QueueConfig['queues']) {
    const queue = this.config.queues[queueName];
    return {
      prefix: queue.prefix,
      defaultJobOptions: queue.defaultJobOptions || this.getDefaultJobOptions(),
      connection: this.getBullRedisOptions()
    };
  }

  getBullWorkerOptions(queueName: keyof QueueConfig['queues']) {
    const queue = this.config.queues[queueName];
    return {
      prefix: queue.prefix,
      concurrency: queue.concurrency,
      maxStalledCount: this.config.workers.maxStalledCount,
      stalledInterval: this.config.workers.stalledInterval,
      lockDuration: this.config.workers.lockDuration,
      lockRenewTime: this.config.workers.lockRenewTime,
      connection: this.getBullRedisOptions()
    };
  }
}

export const queueConfig = QueueConfiguration.getInstance();

export const queue = {
  get: <T = any>(path: string, defaultValue?: T) => queueConfig.get(path, defaultValue),
  redis: () => queueConfig.getRedisConfig(),
  queue: (name: keyof QueueConfig['queues']) => queueConfig.getQueueConfig(name),
  allQueues: () => queueConfig.getAllQueues(),
  worker: () => queueConfig.getWorkerConfig(),
  defaultJobOptions: () => queueConfig.getDefaultJobOptions(),
  monitoring: () => queueConfig.getMonitoringConfig(),
  rateLimit: () => queueConfig.getRateLimitConfig(),
  bull: {
    redis: () => queueConfig.getBullRedisOptions(),
    queue: (name: keyof QueueConfig['queues']) => queueConfig.getBullQueueOptions(name),
    worker: (name: keyof QueueConfig['queues']) => queueConfig.getBullWorkerOptions(name)
  }
};

