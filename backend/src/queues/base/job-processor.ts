import { PrismaClient } from '@prisma/client';
import { FastifyInstance } from 'fastify';
import { logger } from '../../common/utils/logger';
import * as cron from 'node-cron';

export interface JobData {
  id: string;
  type: string;
  data: any;
  attempts: number;
  maxAttempts: number;
}

export interface JobResult {
  success: boolean;
  data?: any;
  error?: string;
}

export abstract class JobProcessor {
  protected prisma: PrismaClient;
  protected isRunning = false;
  protected processingInterval: NodeJS.Timeout | null = null;
  protected cronJobs: Map<string, cron.ScheduledTask> = new Map();

  constructor(
    protected fastify: FastifyInstance,
    protected jobType: string,
    protected pollingInterval = 5000, // 5 seconds
    protected concurrency = 1,
  ) {
    this.prisma = fastify.prisma;
  }

  abstract processJob(jobData: any): Promise<any>;

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn(`${this.jobType} processor already running`);
      return;
    }

    this.isRunning = true;
    logger.info(`Starting ${this.jobType} processor`);

    // Start processing loop
    this.processingInterval = setInterval(() => {
      if (this.isRunning) {
        this.processNextBatch().catch(err => {
          logger.error(`Error in ${this.jobType} processing loop`, err);
        });
      }
    }, this.pollingInterval);

    // Setup recurring jobs
    await this.setupRecurringJobs();
  }

  async stop(): Promise<void> {
    logger.info(`Stopping ${this.jobType} processor`);
    this.isRunning = false;

    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    // Stop all cron jobs
    for (const [name, task] of this.cronJobs) {
      task.stop();
      logger.info(`Stopped cron job: ${name}`);
    }
    this.cronJobs.clear();
  }

  private async processNextBatch(): Promise<void> {
    if (!this.isRunning) return;

    try {
      // Lock and fetch jobs
      const jobs = await this.prisma.$transaction(async (tx) => {
        // Fetch pending jobs
        const pendingJobs = await tx.jobQueue.findMany({
          where: {
            type: this.jobType,
            status: 'pending',
            scheduledFor: {
              lte: new Date(),
            },
            attempts: {
              lt: this.prisma.jobQueue.fields.maxAttempts,
            },
          },
          orderBy: [
            { priority: 'asc' },
            { createdAt: 'asc' },
          ],
          take: this.concurrency,
        });

        if (pendingJobs.length === 0) return [];

        // Mark as processing
        const jobIds = pendingJobs.map(j => j.id);
        await tx.jobQueue.updateMany({
          where: {
            id: { in: jobIds },
            status: 'pending', // Double-check status
          },
          data: {
            status: 'processing',
            startedAt: new Date(),
            attempts: { increment: 1 },
          },
        });

        return pendingJobs;
      });

      // Process jobs in parallel
      await Promise.all(jobs.map(job => this.processJobWithErrorHandling(job)));
    } catch (error) {
      logger.error(`Failed to process ${this.jobType} batch`, error);
    }
  }

  private async processJobWithErrorHandling(job: any): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.info(`Processing ${this.jobType} job ${job.id}`);
      
      const result = await this.processJob(job.data);
      
      await this.prisma.jobQueue.update({
        where: { id: job.id },
        data: {
          status: 'completed',
          result: result as any,
          completedAt: new Date(),
        },
      });

      const duration = Date.now() - startTime;
      logger.info(`Completed ${this.jobType} job ${job.id} in ${duration}ms`);
    } catch (error) {
      logger.error(`Failed ${this.jobType} job ${job.id}`, error);
      
      const isLastAttempt = job.attempts >= job.maxAttempts;
      
      await this.prisma.jobQueue.update({
        where: { id: job.id },
        data: {
          status: isLastAttempt ? 'failed' : 'pending',
          error: error.message,
          ...(isLastAttempt && { completedAt: new Date() }),
        },
      });
    }
  }

  async addJob(data: any, options?: {
    priority?: number;
    scheduledFor?: Date;
    maxAttempts?: number;
  }): Promise<string> {
    const job = await this.prisma.jobQueue.create({
      data: {
        type: this.jobType,
        data: data as any,
        priority: options?.priority ?? 5,
        scheduledFor: options?.scheduledFor ?? new Date(),
        maxAttempts: options?.maxAttempts ?? 3,
      },
    });

    logger.info(`Added ${this.jobType} job ${job.id}`);
    return job.id;
  }

  async getJobStatus(jobId: string): Promise<any> {
    return this.prisma.jobQueue.findUnique({
      where: { id: jobId },
    });
  }

  async getMetrics(): Promise<any> {
    const [pending, processing, completed, failed] = await Promise.all([
      this.prisma.jobQueue.count({
        where: { type: this.jobType, status: 'pending' },
      }),
      this.prisma.jobQueue.count({
        where: { type: this.jobType, status: 'processing' },
      }),
      this.prisma.jobQueue.count({
        where: { 
          type: this.jobType, 
          status: 'completed',
          completedAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
      }),
      this.prisma.jobQueue.count({
        where: { 
          type: this.jobType, 
          status: 'failed',
          completedAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
      }),
    ]);

    return {
      pending,
      processing,
      completed,
      failed,
      total: pending + processing,
    };
  }

  protected async setupRecurringJobs(): Promise<void> {
    const recurringJobs = await this.prisma.recurringJob.findMany({
      where: {
        type: this.jobType,
        enabled: true,
      },
    });

    for (const job of recurringJobs) {
      this.scheduleRecurringJob(job);
    }
  }

  protected scheduleRecurringJob(job: any): void {
    if (this.cronJobs.has(job.name)) {
      this.cronJobs.get(job.name)?.stop();
    }

    const task = cron.schedule(job.schedule, async () => {
      try {
        logger.info(`Running recurring job: ${job.name}`);
        
        await this.addJob(job.data, {
          priority: 1, // High priority for recurring jobs
        });

        await this.prisma.recurringJob.update({
          where: { id: job.id },
          data: {
            lastRunAt: new Date(),
            nextRunAt: this.getNextRunTime(job.schedule),
          },
        });
      } catch (error) {
        logger.error(`Failed to run recurring job: ${job.name}`, error);
      }
    });

    this.cronJobs.set(job.name, task);
    logger.info(`Scheduled recurring job: ${job.name} (${job.schedule})`);
  }

  private getNextRunTime(cronExpression: string): Date {
    const interval = cron.validate(cronExpression);
    if (!interval) return new Date();
    
    // Simple next run calculation - in production use a proper cron parser
    const now = new Date();
    return new Date(now.getTime() + 24 * 60 * 60 * 1000); // Default to tomorrow
  }
}
