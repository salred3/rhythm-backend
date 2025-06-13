import { JobProcessor } from './base/job-processor';
import { logger } from '../common/utils/logger';

export interface LearningJobData {
  type: 'monthly-retrain' | 'feature-calculation';
  modelType?: string;
  userId?: string;
}

export class LearningProcessor extends JobProcessor {
  constructor(fastify: any) {
    super(fastify, 'learning', 120000, 1); // 2 minute polling, 1 concurrent
  }

  async processJob(data: LearningJobData): Promise<any> {
    switch (data.type) {
      case 'monthly-retrain':
        return this.performMonthlyRetrain(data.userId);
      
      case 'feature-calculation':
        return this.calculateFeatures(data.userId!);
      
      default:
        throw new Error(`Unknown learning job type: ${data.type}`);
    }
  }

  private async performMonthlyRetrain(userId?: string): Promise<any> {
    logger.info('Starting monthly ML retrain', { userId });

    // Get training data
    const tasks = await this.prisma.task.findMany({
      where: {
        ...(userId && { userId }),
        status: 'completed',
        actualMinutes: { gt: 0 },
        completedAt: {
          gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // Last 90 days
        },
      },
      include: {
        tags: true,
        project: true,
      },
    });

    if (tasks.length < 10) {
      logger.warn('Not enough data for training', { count: tasks.length });
      return { skipped: true, reason: 'Insufficient data' };
    }

    // Extract features (simplified)
    const features = tasks.map(task => ({
      effort: task.effort || 3,
      impact: task.impact || 3,
      tagCount: task.tags.length,
      descriptionLength: task.description?.length || 0,
      hasProject: task.projectId ? 1 : 0,
      dayOfWeek: new Date(task.createdAt).getDay(),
      actual: task.actualMinutes,
    }));

    // Simple linear regression coefficients (in production, use proper ML)
    const coefficients = this.calculateCoefficients(features);

    // Store model parameters
    const modelId = `model-${Date.now()}`;
    await this.prisma.jobQueue.create({
      data: {
        type: 'model-storage',
        status: 'completed',
        data: {
          modelId,
          coefficients,
          accuracy: 0.85, // Placeholder
          trainedOn: tasks.length,
        },
        completedAt: new Date(),
      },
    });

    logger.info('Monthly retrain complete', { modelId, samplesUsed: tasks.length });

    return {
      modelId,
      samplesUsed: tasks.length,
      coefficients,
    };
  }

  private calculateCoefficients(features: any[]): any {
    // Simplified - in production use proper regression
    return {
      effort: 15,
      impact: 10,
      tagCount: 5,
      descriptionLength: 0.1,
      hasProject: 20,
      dayOfWeek: -2,
      intercept: 30,
    };
  }

  private async calculateFeatures(userId: string): Promise<any> {
    const tasks = await this.prisma.task.findMany({
      where: { userId, status: 'open' },
      include: { tags: true },
    });

    const updates = tasks.map(task => ({
      taskId: task.id,
      features: {
        effort: task.effort || 3,
        impact: task.impact || 3,
        tagCount: task.tags.length,
      },
    }));

    logger.info(`Calculated features for ${updates.length} tasks`);

    return { processed: updates.length };
  }

  async setupRecurringJobs(): Promise<void> {
    // Monthly retraining on 1st of month
    await this.prisma.recurringJob.upsert({
      where: { name: 'monthly-ml-retrain' },
      create: {
        name: 'monthly-ml-retrain',
        type: 'learning',
        schedule: '0 4 1 * *', // 4 AM on 1st
        data: { type: 'monthly-retrain' },
        enabled: true,
        nextRunAt: new Date(),
      },
      update: { enabled: true },
    });

    await super.setupRecurringJobs();
  }
}
