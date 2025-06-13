import { PrismaService } from '../../../common/database/prisma.service';
import { CacheService } from '../../../common/services/cache.service';
import { Queue } from 'bullmq';

interface DailyMetrics {
  date: Date;
  tasksCompleted: number;
  timeTracked: number;
  priorityChanges: number;
  keyEvents: Array<{ type: string; description: string; timestamp: Date }>;
}

export class DailyAggregator {
  private aggregationQueue: Queue;

  constructor(
    private prisma: PrismaService,
    private cache: CacheService
  ) {
    this.aggregationQueue = new Queue('daily-aggregation');
  }

  async aggregateForDate(date: Date): Promise<DailyMetrics> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const [tasksCompleted, timeTracked, priorityChanges, keyEvents] = await Promise.all([
      this.aggregateTaskCompletions(startOfDay, endOfDay),
      this.aggregateTimeTracked(startOfDay, endOfDay),
      this.aggregatePriorityChanges(startOfDay, endOfDay),
      this.aggregateKeyEvents(startOfDay, endOfDay)
    ]);

    const metrics: DailyMetrics = {
      date,
      tasksCompleted,
      timeTracked,
      priorityChanges,
      keyEvents
    };

    await this.storeDailyMetrics(metrics);
    await this.cache.set(`daily:${date.toISOString().split('T')[0]}`, metrics, 86400);

    return metrics;
  }

  async scheduleDailyAggregation(): Promise<void> {
    await this.aggregationQueue.add('daily-rollup', { date: new Date() }, { repeat: { cron: '0 1 * * *' } });
  }

  private async aggregateTaskCompletions(start: Date, end: Date): Promise<number> {
    const result = await this.prisma.task.count({
      where: { status: 'completed', completedAt: { gte: start, lte: end } }
    });
    return result;
  }

  private async aggregateTimeTracked(start: Date, end: Date): Promise<number> {
    const entries = await this.prisma.timeEntry.findMany({
      where: { startTime: { gte: start, lte: end } }
    });
    return entries.reduce((total, entry) => total + (entry.duration || 0), 0);
  }

  private async aggregatePriorityChanges(start: Date, end: Date): Promise<number> {
    const logs = await this.prisma.activityLog.count({
      where: { type: 'priority_change', timestamp: { gte: start, lte: end } }
    });
    return logs;
  }

  private async aggregateKeyEvents(start: Date, end: Date): Promise<Array<{ type: string; description: string; timestamp: Date }>> {
    const events = await this.prisma.activityLog.findMany({
      where: {
        timestamp: { gte: start, lte: end },
        type: { in: ['milestone_reached', 'deadline_missed', 'project_completed', 'high_productivity'] }
      },
      orderBy: { timestamp: 'desc' },
      take: 10
    });

    return events.map(event => ({ type: event.type, description: event.description || '', timestamp: event.timestamp }));
  }

  private async storeDailyMetrics(metrics: DailyMetrics): Promise<void> {
    await this.prisma.dailyMetrics.upsert({
      where: { date: metrics.date },
      create: {
        date: metrics.date,
        tasksCompleted: metrics.tasksCompleted,
        timeTracked: metrics.timeTracked,
        priorityChanges: metrics.priorityChanges,
        keyEvents: JSON.stringify(metrics.keyEvents)
      },
      update: {
        tasksCompleted: metrics.tasksCompleted,
        timeTracked: metrics.timeTracked,
        priorityChanges: metrics.priorityChanges,
        keyEvents: JSON.stringify(metrics.keyEvents)
      }
    });
  }

  async getDailyMetrics(date: Date): Promise<DailyMetrics | null> {
    const dateStr = date.toISOString().split('T')[0];
    const cached = await this.cache.get(`daily:${dateStr}`);
    if (cached) return cached;

    const stored = await this.prisma.dailyMetrics.findUnique({ where: { date } });
    if (!stored) return null;

    const metrics: DailyMetrics = {
      date: stored.date,
      tasksCompleted: stored.tasksCompleted,
      timeTracked: stored.timeTracked,
      priorityChanges: stored.priorityChanges,
      keyEvents: JSON.parse(stored.keyEvents as string)
    };

    await this.cache.set(`daily:${dateStr}`, metrics, 86400);
    return metrics;
  }

  async aggregateRange(startDate: Date, endDate: Date): Promise<DailyMetrics[]> {
    const metrics: DailyMetrics[] = [];
    const current = new Date(startDate);

    while (current <= endDate) {
      const dayMetrics = await this.getDailyMetrics(current) || await this.aggregateForDate(current);
      metrics.push(dayMetrics);
      current.setDate(current.getDate() + 1);
    }

    return metrics;
  }
}
