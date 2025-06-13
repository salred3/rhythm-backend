import { Logger } from '../logger/logger.service';

interface ScheduledJob {
  name: string;
  schedule: string; // cron expression or 'daily' | 'weekly' | 'monthly'
  handler: () => Promise<void>;
  lastRun?: Date;
  nextRun: Date;
}

export class SimpleScheduler {
  private static instance: SimpleScheduler;
  private jobs: Map<string, ScheduledJob> = new Map();
  private intervalId: NodeJS.Timeout | null = null;
  private logger: Logger;

  private constructor() {
    this.logger = new Logger('SimpleScheduler');
    this.start();
  }

  public static getInstance(): SimpleScheduler {
    if (!SimpleScheduler.instance) {
      SimpleScheduler.instance = new SimpleScheduler();
    }
    return SimpleScheduler.instance;
  }

  /**
   * Register a job
   */
  public registerJob(name: string, schedule: string, handler: () => Promise<void>): void {
    const nextRun = this.calculateNextRun(schedule);
    
    this.jobs.set(name, {
      name,
      schedule,
      handler,
      nextRun,
    });

    this.logger.info(`Job registered: ${name}, next run: ${nextRun}`);
  }

  /**
   * Start the scheduler
   */
  private start(): void {
    // Check for jobs every minute
    this.intervalId = setInterval(() => {
      this.checkAndRunJobs();
    }, 60 * 1000); // 1 minute

    this.logger.info('Scheduler started');
  }

  /**
   * Check and run due jobs
   */
  private async checkAndRunJobs(): Promise<void> {
    const now = new Date();

    for (const [name, job] of this.jobs) {
      if (now >= job.nextRun) {
        this.logger.info(`Running job: ${name}`);
        
        try {
          // Run job
          await job.handler();
          
          // Update last run and calculate next run
          job.lastRun = now;
          job.nextRun = this.calculateNextRun(job.schedule, now);
          
          this.logger.info(`Job completed: ${name}, next run: ${job.nextRun}`);
        } catch (error) {
          this.logger.error(`Job failed: ${name}`, error);
        }
      }
    }
  }

  /**
   * Calculate next run time
   */
  private calculateNextRun(schedule: string, fromDate?: Date): Date {
    const from = fromDate || new Date();
    const next = new Date(from);

    switch (schedule) {
      case 'daily':
        next.setDate(next.getDate() + 1);
        next.setHours(2, 0, 0, 0); // 2 AM
        break;

      case 'weekly':
        next.setDate(next.getDate() + 7);
        next.setHours(2, 0, 0, 0); // 2 AM on same day next week
        break;

      case 'monthly':
        next.setMonth(next.getMonth() + 1);
        next.setDate(1);
        next.setHours(2, 0, 0, 0); // 2 AM on first day of next month
        break;

      default:
        // For now, default to daily
        next.setDate(next.getDate() + 1);
        next.setHours(2, 0, 0, 0);
    }

    return next;
  }

  /**
   * Stop the scheduler
   */
  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.logger.info('Scheduler stopped');
    }
  }
}

// Export singleton
export const scheduler = SimpleScheduler.getInstance();
