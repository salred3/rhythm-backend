import { JobProcessor } from './base/job-processor';
import { logger } from '../common/utils/logger';

export interface AnalyticsJobData {
  type: 'daily-aggregation' | 'report-generation' | 'data-cleanup';
  targetDate?: string;
  companyId?: string;
  reportType?: string;
}

export class AnalyticsProcessor extends JobProcessor {
  constructor(fastify: any) {
    super(fastify, 'analytics', 60000, 1); // 1 minute polling, 1 concurrent
  }

  async processJob(data: AnalyticsJobData): Promise<any> {
    switch (data.type) {
      case 'daily-aggregation':
        return this.processDailyAggregation(data.targetDate);
      
      case 'report-generation':
        return this.generateReport(data.reportType!, data.companyId);
      
      case 'data-cleanup':
        return this.cleanupOldData();
      
      default:
        throw new Error(`Unknown analytics job type: ${data.type}`);
    }
  }

  private async processDailyAggregation(targetDate?: string): Promise<any> {
    const date = targetDate ? new Date(targetDate) : new Date();
    date.setHours(0, 0, 0, 0);
    
    const endDate = new Date(date);
    endDate.setDate(date.getDate() + 1);

    logger.info(`Processing analytics for ${date.toISOString()}`);

    // Aggregate metrics
    const [tasksCreated, tasksCompleted, timeTracked] = await Promise.all([
      this.prisma.task.count({
        where: {
          createdAt: { gte: date, lt: endDate },
        },
      }),
      this.prisma.task.count({
        where: {
          completedAt: { gte: date, lt: endDate },
        },
      }),
      this.prisma.taskTimeLog.aggregate({
        where: {
          startTime: { gte: date, lt: endDate },
        },
        _sum: { duration: true },
      }),
    ]);

    // Store aggregated data (you'd need to add this table)
    const result = {
      date: date.toISOString(),
      tasksCreated,
      tasksCompleted,
      totalTimeTracked: (timeTracked as any)._sum.duration || 0,
    };

    logger.info('Daily aggregation complete', result);
    return result;
  }

  private async generateReport(reportType: string, companyId?: string): Promise<any> {
    logger.info(`Generating ${reportType} report for company ${companyId}`);
    
    // Simplified report generation
    const data = await this.prisma.task.findMany({
      where: {
        companyId,
        completedAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        },
      },
      include: {
        timeLogs: true,
        assignedTo: true,
      },
    });

    return {
      reportType,
      companyId,
      recordCount: data.length,
      generatedAt: new Date(),
    };
  }

  private async cleanupOldData(): Promise<any> {
    const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days
    
    const deleted = await this.prisma.jobQueue.deleteMany({
      where: {
        status: { in: ['completed', 'failed'] },
        completedAt: { lt: cutoffDate },
      },
    });

    logger.info(`Cleaned up ${deleted.count} old jobs`);
    return { deletedCount: deleted.count };
  }

  async setupRecurringJobs(): Promise<void> {
    // Daily aggregation
    await this.prisma.recurringJob.upsert({
      where: { name: 'daily-analytics-aggregation' },
      create: {
        name: 'daily-analytics-aggregation',
        type: 'analytics',
        schedule: '0 2 * * *', // 2 AM daily
        data: { type: 'daily-aggregation' },
        enabled: true,
        nextRunAt: new Date(),
      },
      update: { enabled: true },
    });

    // Weekly cleanup
    await this.prisma.recurringJob.upsert({
      where: { name: 'weekly-data-cleanup' },
      create: {
        name: 'weekly-data-cleanup',
        type: 'analytics',
        schedule: '0 3 * * 0', // Sunday 3 AM
        data: { type: 'data-cleanup' },
        enabled: true,
        nextRunAt: new Date(),
      },
      update: { enabled: true },
    });

    await super.setupRecurringJobs();
  }
}
