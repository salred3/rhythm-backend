import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from '../middleware/logging.middleware';

export class PrismaService extends PrismaClient {
  private static instance: PrismaService;
  private isConnected = false;

  constructor() {
    super({
      log: [
        { level: 'query', emit: 'event' },
        { level: 'info', emit: 'event' },
        { level: 'warn', emit: 'event' },
        { level: 'error', emit: 'event' }
      ],
      errorFormat: 'pretty'
    });
    this.setupLogging();
    this.setupMiddleware();
  }

  static getInstance(): PrismaService {
    if (!this.instance) {
      this.instance = new PrismaService();
    }
    return this.instance;
  }

  private setupLogging() {
    this.$on('query' as any, (e: any) => {
      if (process.env.LOG_LEVEL === 'debug') {
        logger.debug('Database query', { query: e.query, params: e.params, duration: e.duration, target: e.target });
      }
    });
    this.$on('info' as any, (e: any) => { logger.info('Database info', { message: e.message }); });
    this.$on('warn' as any, (e: any) => { logger.warn('Database warning', { message: e.message }); });
    this.$on('error' as any, (e: any) => { logger.error('Database error', { message: e.message }); });
  }

  private setupMiddleware() {
    this.$use(async (params, next) => {
      if (params.model && this.hasSoftDelete(params.model)) {
        if (params.action === 'delete') {
          params.action = 'update';
          params.args['data'] = { deletedAt: new Date() };
        }
        if (params.action === 'deleteMany') {
          params.action = 'updateMany';
          if (params.args.data !== undefined) {
            params.args.data['deletedAt'] = new Date();
          } else {
            params.args['data'] = { deletedAt: new Date() };
          }
        }
        if (params.action === 'findFirst' || params.action === 'findMany') {
          if (!params.args.where) {
            params.args.where = {};
          }
          params.args.where['deletedAt'] = null;
        }
      }
      const result = await next(params);
      return result;
    });
    this.$use(async (params, next) => {
      const start = Date.now();
      const result = await next(params);
      const duration = Date.now() - start;
      if (duration > 1000) {
        logger.warn('Slow database query', { model: params.model, action: params.action, duration, args: params.args });
      }
      return result;
    });
  }

  private hasSoftDelete(model: string): boolean {
    const softDeleteModels = ['User', 'Company', 'Task', 'Project'];
    return softDeleteModels.includes(model);
  }

  async connect(): Promise<void> {
    try {
      await this.$connect();
      this.isConnected = true;
      logger.info('Database connected successfully');
    } catch (error) {
      logger.error('Failed to connect to database', { error });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.$disconnect();
      this.isConnected = false;
      logger.info('Database disconnected successfully');
    } catch (error) {
      logger.error('Failed to disconnect from database', { error });
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      logger.error('Database health check failed', { error });
      return false;
    }
  }

  async transaction<T>(fn: (prisma: Prisma.TransactionClient) => Promise<T>, options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel; retries?: number; }): Promise<T> {
    const { retries = 3, ...transactionOptions } = options || {};
    let lastError: any;
    for (let i = 0; i < retries; i++) {
      try {
        return await this.$transaction(fn, transactionOptions);
      } catch (error: any) {
        lastError = error;
        if (!this.isRetryableError(error)) {
          throw error;
        }
        if (i < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 100));
        }
      }
    }
    throw lastError;
  }

  private isRetryableError(error: any): boolean {
    const retryableCodes = ['P2034', 'P2028'];
    return error?.code && retryableCodes.includes(error.code);
  }

  async batchCreate<T>(model: string, data: any[], batchSize = 100): Promise<T[]> {
    const results: T[] = [];
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      const created = await (this as any)[model].createMany({ data: batch, skipDuplicates: true });
      results.push(...created);
    }
    return results;
  }

  async getSlowQueries(threshold = 1000): Promise<any[]> {
    return [];
  }

  async getConnectionPoolStats(): Promise<any> {
    return { active: this.isConnected };
  }
}

export const prisma = PrismaService.getInstance();

