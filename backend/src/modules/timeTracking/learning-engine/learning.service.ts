import { PrismaClient } from '@prisma/client';
import { FeatureExtractor } from './feature-extractor';
import { ModelTrainer } from './model-trainer';
import { PredictionService } from './prediction.service';
import { queueService } from '../../../common/queue/queue.service';
import { Logger } from '../../../common/logger/logger.service';

interface ModelMetrics {
  accuracy: number;
  meanAbsoluteError: number;
  meanSquaredError: number;
  r2Score: number;
  lastTrainedAt: Date;
  dataPointsUsed: number;
}

interface TrainingResult {
  modelId: string;
  version: string;
  metrics: ModelMetrics;
  improvements: {
    accuracyDelta: number;
    maeDelta: number;
  };
}

export class LearningService {
  private prisma: PrismaClient;
  private featureExtractor: FeatureExtractor;
  private modelTrainer: ModelTrainer;
  private predictionService: PredictionService;
  private logger: Logger;

  constructor() {
    this.prisma = new PrismaClient();
    this.featureExtractor = new FeatureExtractor();
    this.modelTrainer = new ModelTrainer();
    this.predictionService = new PredictionService();
    this.logger = new Logger('LearningService');

    // Setup job processors
    this.setupJobProcessors();
  }

  /**
   * Trigger model retraining
   */
  async triggerRetraining(params: {
    companyId?: string;
    userId?: string;
    force?: boolean;
  }): Promise<string> {
    const { companyId, userId, force = false } = params;

    if (!force) {
      const shouldRetrain = await this.shouldRetrain({ companyId, userId });
      if (!shouldRetrain) {
        this.logger.info('Retraining not needed based on current metrics');
        return 'skipped';
      }
    }

    const jobId = await queueService.addJob('retrain-model', {
      companyId,
      userId,
      timestamp: new Date(),
    }, {
      priority: 10,
      retryLimit: 2,
      retryDelay: 300,
    });

    this.logger.info(`Retraining job queued: ${jobId}`);
    return jobId || 'queued';
  }

  /**
   * Prepare data for training
   */
  async prepareTrainingData(params: {
    companyId?: string;
    userId?: string;
    minDataPoints?: number;
  }): Promise<any> {
    const { companyId, userId, minDataPoints = 100 } = params;

    const where: any = {};
    if (companyId) where.companyId = companyId;
    if (userId) where.userId = userId;

    const tasks = await this.prisma.task.findMany({
      where: {
        ...where,
        status: 'done',
        timeSpent: { gt: 0 },
        timeEntries: { some: {} },
      },
      include: {
        timeEntries: true,
        project: true,
        assignee: {
          select: {
            id: true,
            preferences: true,
          },
        },
        tags: true,
        subtasks: true,
        dependencies: true,
      },
    });

    if (tasks.length < minDataPoints) {
      throw new Error(`Insufficient data for training. Need ${minDataPoints}, have ${tasks.length}`);
    }

    const trainingData = await Promise.all(
      tasks.map(async (task) => {
        const features = await this.featureExtractor.extractFeatures(task);
        const actualDuration = task.timeSpent;
        const estimatedDuration = task.estimatedTime || 0;

        return {
          features,
          target: actualDuration,
          metadata: {
            taskId: task.id,
            estimatedDuration,
            error: Math.abs(actualDuration - estimatedDuration),
          },
        };
      })
    );

    const splitIndex = Math.floor(trainingData.length * 0.8);
    const shuffled = trainingData.sort(() => Math.random() - 0.5);

    return {
      training: shuffled.slice(0, splitIndex),
      validation: shuffled.slice(splitIndex),
      totalSamples: trainingData.length,
    };
  }

  /**
   * Train and evaluate model
   */
  async trainModel(params: {
    companyId?: string;
    userId?: string;
  }): Promise<TrainingResult> {
    const { companyId, userId } = params;

    try {
      const data = await this.prepareTrainingData({ companyId, userId });

      const currentMetrics = await this.getCurrentModelMetrics({ companyId, userId });

      const trainedModel = await this.modelTrainer.train({
        trainingData: data.training,
        validationData: data.validation,
        hyperparameters: {
          learningRate: 0.001,
          epochs: 100,
          batchSize: 32,
          hiddenLayers: [64, 32, 16],
          dropout: 0.2,
          earlyStopping: {
            patience: 10,
            minDelta: 0.001,
          },
        },
      });

      const metrics = await this.modelTrainer.evaluate({
        model: trainedModel,
        testData: data.validation,
      });

      const improvements = {
        accuracyDelta: metrics.accuracy - (currentMetrics?.accuracy || 0),
        maeDelta: (currentMetrics?.meanAbsoluteError || Infinity) - metrics.meanAbsoluteError,
      };

      if (improvements.accuracyDelta > 0 || improvements.maeDelta > 0) {
        await this.deployModel({
          model: trainedModel,
          metrics,
          companyId,
          userId,
        });

        this.logger.info('Model deployed with improvements', improvements);
      } else {
        this.logger.info('Model not deployed - no improvements', improvements);
      }

      return {
        modelId: trainedModel.id,
        version: trainedModel.version,
        metrics,
        improvements,
      };
    } catch (error) {
      this.logger.error('Model training failed', error);
      throw error;
    }
  }

  /**
   * Deploy trained model
   */
  private async deployModel(params: {
    model: any;
    metrics: ModelMetrics;
    companyId?: string;
    userId?: string;
  }): Promise<void> {
    const { model, metrics, companyId, userId } = params;

    const modelKey = this.generateModelKey({ companyId, userId });

    const modelData = {
      architecture: model.model.toJSON(),
      weights: model.model.getWeights().map((w: any) => ({
        values: Array.from(w.dataSync()),
        shape: w.shape,
      })),
      inputShape: model.model.inputs[0].shape.slice(1),
    };

    await this.prisma.mLModel.upsert({
      where: {
        key: modelKey,
      },
      create: {
        key: modelKey,
        companyId,
        userId,
        version: model.version,
        modelData: modelData as any,
        metadata: {
          featureNames: model.featureNames,
          normalizationParams: model.normalizationParams,
        } as any,
        metrics: metrics as any,
        deployedAt: new Date(),
        isActive: true,
      },
      update: {
        version: model.version,
        modelData: modelData as any,
        metadata: {
          featureNames: model.featureNames,
          normalizationParams: model.normalizationParams,
        } as any,
        metrics: metrics as any,
        deployedAt: new Date(),
        isActive: true,
      },
    });

    await this.predictionService.reloadModel(modelKey);

    await this.prisma.modelDeployment.create({
      data: {
        modelKey,
        version: model.version,
        metrics: metrics as any,
        deployedAt: new Date(),
        deployedBy: userId || 'system',
      },
    });
  }

  /**
   * Check if model should be retrained
   */
  private async shouldRetrain(params: {
    companyId?: string;
    userId?: string;
  }): Promise<boolean> {
    const { companyId, userId } = params;
    const modelKey = this.generateModelKey({ companyId, userId });

    const currentModel = await this.prisma.mLModel.findUnique({
      where: { key: modelKey },
    });

    if (!currentModel) {
      return true;
    }

    const daysSinceTraining = 
      (Date.now() - (currentModel.deployedAt as any).getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysSinceTraining >= 30) {
      return true;
    }

    const recentPredictions = await this.prisma.prediction.findMany({
      where: {
        modelKey,
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
        actualValue: { not: null },
      },
    });

    if (recentPredictions.length < 10) {
      return false;
    }

    const recentMae = recentPredictions.reduce((sum, pred) => {
      return sum + Math.abs(pred.predictedValue - (pred.actualValue as number));
    }, 0) / recentPredictions.length;

    const currentMae = (currentModel.metrics as any).meanAbsoluteError;
    const degradation = (recentMae - currentMae) / currentMae;

    return degradation > 0.2;
  }

  private async getCurrentModelMetrics(params: {
    companyId?: string;
    userId?: string;
  }): Promise<ModelMetrics | null> {
    const modelKey = this.generateModelKey(params);

    const model = await this.prisma.mLModel.findUnique({
      where: { key: modelKey },
    });

    return model ? (model.metrics as any) : null;
  }

  private setupJobProcessors(): void {
    queueService.processJobs('retrain-model', async (job) => {
      const { companyId, userId } = job.data;
      return await this.trainModel({ companyId, userId });
    });

    queueService.processJobs('monthly-retrain-all', async () => {
      const activeModels = await this.prisma.mLModel.findMany({
        where: { isActive: true },
      });

      const jobs = await Promise.all(
        activeModels.map(model => 
          this.triggerRetraining({
            companyId: model.companyId || undefined,
            userId: model.userId || undefined,
          })
        )
      );

      return { modelsQueued: jobs.length };
    });
  }

  private generateModelKey(params: {
    companyId?: string;
    userId?: string;
  }): string {
    const { companyId, userId } = params;
    
    if (userId) return `user_${userId}`;
    if (companyId) return `company_${companyId}`;
    return 'global';
  }

  async prepareABTest(params: {
    modelA: string;
    modelB: string;
    splitRatio: number;
  }): Promise<void> {
    await this.prisma.aBTest.create({
      data: {
        modelAKey: params.modelA,
        modelBKey: params.modelB,
        splitRatio: params.splitRatio,
        startedAt: new Date(),
        isActive: true,
      },
    });
  }
}
