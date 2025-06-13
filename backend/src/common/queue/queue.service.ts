import PgBoss from 'pg-boss';
import { Logger } from '../logger/logger.service';

export class QueueService {
  private static instance: QueueService;
  private boss: PgBoss;
  private logger: Logger;
  private isStarted: boolean = false;

  private constructor() {
    this.logger = new Logger('QueueService');
    
    // Initialize pg-boss with your existing PostgreSQL connection
    this.boss = new PgBoss({
      connectionString: process.env.DATABASE_URL,
      // Use a schema to keep job tables organized
      schema: 'pgboss',
      // Retention settings
      retentionDays: 30,
      retryLimit: 3,
      retryDelay: 60,
      // Monitoring
      monitorStateIntervalSeconds: 30,
    });

    this.initialize();
  }

  public static getInstance(): QueueService {
    if (!QueueService.instance) {
      QueueService.instance = new QueueService();
    }
    return QueueService.instance;
  }

  private async initialize(): Promise<void> {
    try {
      await this.boss.start();
      this.isStarted = true;
      this.logger.info('Queue service started successfully');
      
      // Setup job handlers
      this.setupHandlers();
      
      // Setup recurring jobs
      await this.setupRecurringJobs();
    } catch (error) {
      this.logger.error('Failed to start queue service', error);
      throw error;
    }
  }

  /**
   * Add a job to the queue
   */
  async addJob<T = any>(
    name: string,
    data: T,
    options?: PgBoss.SendOptions
  ): Promise<string | null> {
    if (!this.isStarted) {
      throw new Error('Queue service not started');
    }

    try {
      const jobId = await this.boss.send(name, data, options);
      this.logger.debug(`Job ${name} added with ID: ${jobId}`);
      return jobId;
    } catch (error) {
      this.logger.error(`Failed to add job ${name}`, error);
      throw error;
    }
  }

  /**
   * Schedule a recurring job
   */
  async scheduleJob(
    name: string,
    cron: string,
    data?: any,
    options?: PgBoss.ScheduleOptions
  ): Promise<void> {
    try {
      await this.boss.schedule(name, cron, data, options);
      this.logger.info(`Scheduled job ${name} with cron: ${cron}`);
    } catch (error) {
      this.logger.error(`Failed to schedule job ${name}`, error);
      throw error;
    }
  }

  /**
   * Process jobs
   */
  async processJobs<T = any>(
    name: string,
    handler: (job: PgBoss.Job<T>) => Promise<void>,
    options?: PgBoss.WorkOptions
  ): Promise<void> {
    try {
      await this.boss.work(name, options || {}, async (job) => {
        this.logger.debug(`Processing job ${name}:${job.id}`);
        
        try {
          await handler(job);
          this.logger.debug(`Job ${name}:${job.id} completed`);
        } catch (error) {
          this.logger.error(`Job ${name}:${job.id} failed`, error);
          throw error;
        }
      });
    } catch (error) {
      this.logger.error(`Failed to setup job processor for ${name}`, error);
      throw error;
    }
  }

  /**
   * Setup job handlers
   */
  private setupHandlers(): void {
    // Model retraining handler
    this.processJobs('retrain-model', async (job) => {
      const { companyId, userId } = job.data;
      
      // Import and use the learning service
      const { LearningService } = await import('../../modules/timeTracking/learning-engine/learning.service');
      const learningService = new LearningService();
      
      await learningService.trainModel({ companyId, userId });
    });

    // Timer auto-stop handler
    this.processJobs('auto-stop-timer', async (job) => {
      const { timerId } = job.data;
      
      const { TimerService } = await import('../../modules/timeTracking/timer.service');
      const timerService = new TimerService();
      
      // Implementation for auto-stopping timer
      this.logger.info(`Auto-stopping timer ${timerId}`);
    });

    // Monthly report generation
    this.processJobs('generate-monthly-report', async (job) => {
      const { companyId, month, year } = job.data;
      
      // Generate and email monthly reports
      this.logger.info(`Generating monthly report for ${companyId}`);
    });
  }

  /**
   * Setup recurring jobs
   */
  private async setupRecurringJobs(): Promise<void> {
    // Monthly model retraining - First day of each month at 2 AM
    await this.scheduleJob(
      'monthly-retrain-all',
      '0 2 1 * *',
      {},
      { tz: 'UTC' }
    );

    // Weekly analytics aggregation - Every Sunday at 3 AM
    await this.scheduleJob(
      'weekly-analytics',
      '0 3 * * 0',
      {},
      { tz: 'UTC' }
    );

    // Daily timer cleanup - Every day at midnight
    await this.scheduleJob(
      'daily-timer-cleanup',
      '0 0 * * *',
      {},
      { tz: 'UTC' }
    );

    this.logger.info('Recurring jobs scheduled');
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<PgBoss.Job | null> {
    try {
      const job = await this.boss.getJobById(jobId);
      return job;
    } catch (error) {
      this.logger.error(`Failed to get job status for ${jobId}`, error);
      return null;
    }
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<void> {
    try {
      await this.boss.cancel(jobId);
      this.logger.info(`Job ${jobId} cancelled`);
    } catch (error) {
      this.logger.error(`Failed to cancel job ${jobId}`, error);
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<any> {
    try {
      const states = await this.boss.getQueueSize();
      const completedCount = await this.boss.getCompletedCount();
      const failedCount = await this.boss.getFailedCount();

      return {
        queued: states,
        completed: completedCount,
        failed: failedCount,
      };
    } catch (error) {
      this.logger.error('Failed to get queue stats', error);
      throw error;
    }
  }

  /**
   * Gracefully shutdown
   */
  async shutdown(): Promise<void> {
    if (this.isStarted) {
      await this.boss.stop();
      this.isStarted = false;
      this.logger.info('Queue service stopped');
    }
  }
}

// Export singleton instance
export const queueService = QueueService.getInstance();
