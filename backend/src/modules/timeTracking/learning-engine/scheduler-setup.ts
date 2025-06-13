import { scheduler } from '../../../common/scheduler/simple-scheduler';
import { LearningService } from './learning.service';
import { TimerService } from '../timer.service';
import { PrismaClient } from '@prisma/client';
import { Logger } from '../../../common/logger/logger.service';

const logger = new Logger('SchedulerSetup');
const prisma = new PrismaClient();

export function setupScheduledJobs(): void {
  // Monthly model retraining
  scheduler.registerJob('monthly-model-retraining', 'monthly', async () => {
    logger.info('Starting monthly model retraining');
    
    const learningService = new LearningService();
    
    // Get all active models
    const activeModels = await prisma.mLModel.findMany({
      where: { isActive: true },
    });

    for (const model of activeModels) {
      try {
        await learningService.triggerRetraining({
          companyId: model.companyId || undefined,
          userId: model.userId || undefined,
        });
      } catch (error) {
        logger.error(`Failed to retrain model ${model.key}`, error);
      }
    }
  });

  // Daily timer cleanup
  scheduler.registerJob('daily-timer-cleanup', 'daily', async () => {
    logger.info('Running daily timer cleanup');
    
    const timerService = new TimerService();
    
    // Stop all active timers from previous day
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const staleTimers = await prisma.activeTimer.findMany({
      where: {
        isActive: true,
        startTime: {
          lt: yesterday,
        },
      },
    });

    for (const timer of staleTimers) {
      await timerService.stopTimer({
        taskId: timer.taskId,
        userId: timer.userId,
        companyId: timer.companyId,
      });
    }

    logger.info(`Cleaned up ${staleTimers.length} stale timers`);
  });

  // Weekly analytics aggregation
  scheduler.registerJob('weekly-analytics', 'weekly', async () => {
    logger.info('Running weekly analytics aggregation');
    
    // Aggregate time tracking data for faster queries
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // Create weekly summaries
    const result = await prisma.$executeRaw`
      INSERT INTO weekly_summaries (user_id, company_id, week_start, total_time, task_count)
      SELECT 
        user_id,
        company_id,
        DATE_TRUNC('week', start_time) as week_start,
        SUM(duration) as total_time,
        COUNT(DISTINCT task_id) as task_count
      FROM time_entries
      WHERE start_time >= ${oneWeekAgo}
      GROUP BY user_id, company_id, DATE_TRUNC('week', start_time)
      ON CONFLICT (user_id, company_id, week_start) 
      DO UPDATE SET 
        total_time = EXCLUDED.total_time,
        task_count = EXCLUDED.task_count
    `;

    logger.info(`Aggregated analytics for ${result} user-weeks`);
  });

  // Idle timer auto-pause (every 10 minutes)
  setInterval(async () => {
    const timerService = new TimerService();
    await timerService.autoPauseInactiveTimers();
  }, 10 * 60 * 1000); // 10 minutes

  logger.info('All scheduled jobs registered');
}

// Initialize in your main app
// backend/src/index.ts
import { setupScheduledJobs } from './modules/timeTracking/learning-engine/scheduler-setup';

// In your app initialization
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // Setup scheduled jobs
  setupScheduledJobs();
});
