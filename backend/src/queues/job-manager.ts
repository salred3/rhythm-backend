import { FastifyInstance } from 'fastify';
import { logger } from '../common/utils/logger';
import { SchedulerProcessor } from './scheduler-processor';
import { EmailProcessor } from './email-processor';
import { AnalyticsProcessor } from './analytics-processor';
import { LearningProcessor } from './learning-processor';

export class JobManager {
  private processors: Map<string, any> = new Map();

  constructor(private fastify: FastifyInstance) {}

  async initialize(): Promise<void> {
    logger.info('Initializing job manager...');

    try {
      // Initialize processors
      const scheduler = new SchedulerProcessor(this.fastify);
      const email = new EmailProcessor(this.fastify);
      const analytics = new AnalyticsProcessor(this.fastify);
      const learning = new LearningProcessor(this.fastify);

      this.processors.set('scheduler', scheduler);
      this.processors.set('email', email);
      this.processors.set('analytics', analytics);
      this.processors.set('learning', learning);

      // Start all processors
      await Promise.all([
        scheduler.start(),
        email.start(),
        analytics.start(),
        learning.start(),
      ]);

      // Cleanup old jobs on startup
      await this.cleanupOldJobs();

      logger.info('Job manager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize job manager', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down job manager...');

    for (const [name, processor] of this.processors) {
      try {
        await processor.stop();
        logger.info(`Stopped ${name} processor`);
      } catch (error) {
        logger.error(`Failed to stop ${name} processor`, error);
      }
    }

    logger.info('Job manager shut down');
  }

  async addJob(type: string, data: any, options?: any): Promise<string> {
    const processor = this.processors.get(type);
    if (!processor) {
      throw new Error(`Unknown job type: ${type}`);
    }

    return processor.addJob(data, options);
  }

  async getJobStatus(type: string, jobId: string): Promise<any> {
    const processor = this.processors.get(type);
    if (!processor) {
      throw new Error(`Unknown job type: ${type}`);
    }

    return processor.getJobStatus(jobId);
  }

  async getMetrics(): Promise<any> {
    const metrics: Record<string, any> = {};

    for (const [name, processor] of this.processors) {
      metrics[name] = await processor.getMetrics();
    }

    return metrics;
  }

  private async cleanupOldJobs(): Promise<void> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const deleted = await this.fastify.prisma.jobQueue.deleteMany({
      where: {
        status: { in: ['completed', 'failed'] },
        completedAt: { lt: thirtyDaysAgo },
      },
    });

    logger.info(`Cleaned up ${deleted.count} old jobs`);
  }

  // Helper methods for specific job types
  async scheduleUserTasks(userId: string, companyId?: string): Promise<string> {
    return this.addJob('scheduler', {
      userId,
      companyId,
      mode: companyId ? 'per-company' : 'unified',
    });
  }

  async sendEmail(to: string, subject: string, template: string, data: any): Promise<string> {
    return this.addJob('email', {
      to,
      subject,
      template,
      data,
    });
  }

  async generateReport(reportType: string, companyId?: string): Promise<string> {
    return this.addJob('analytics', {
      type: 'report-generation',
      reportType,
      companyId,
    });
  }

  async triggerLearning(userId?: string): Promise<string> {
    return this.addJob('learning', {
      type: 'monthly-retrain',
      userId,
    });
  }
}
