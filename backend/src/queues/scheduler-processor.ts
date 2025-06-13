import { JobProcessor } from './base/job-processor';
import { logger } from '../common/utils/logger';

export interface SchedulerJobData {
  userId: string;
  companyId?: string;
  taskIds?: string[];
  mode: 'unified' | 'per-company';
  dryRun?: boolean;
}

export class SchedulerProcessor extends JobProcessor {
  constructor(fastify: any) {
    super(fastify, 'scheduler', 10000, 2); // 10 second polling, 2 concurrent jobs
  }

  async processJob(data: SchedulerJobData): Promise<any> {
    const result = {
      scheduled: 0,
      failed: 0,
      skipped: 0,
      errors: [] as any[],
    };

    const { userId, companyId, taskIds, mode, dryRun } = data;

    // Fetch tasks to schedule
    const tasks = await this.fetchTasksToSchedule(userId, companyId, taskIds);
    
    logger.info(`Found ${tasks.length} tasks to schedule`, {
      userId,
      companyId,
      mode,
    });

    // Get user's calendar and preferences
    const [calendar, preferences] = await Promise.all([
      this.fetchUserCalendar(userId, companyId),
      this.fetchUserPreferences(userId),
    ]);

    // Process each task
    for (const task of tasks) {
      try {
        const scheduled = await this.scheduleTask(
          task,
          calendar,
          preferences,
          mode,
          dryRun,
        );

        if (scheduled) {
          result.scheduled++;
        } else {
          result.skipped++;
        }
      } catch (error) {
        result.failed++;
        result.errors.push({
          taskId: task.id,
          error: (error as any).message,
        });
        logger.error(`Failed to schedule task ${task.id}`, error);
      }
    }

    // Trigger rescheduling for affected users
    if (!dryRun && result.scheduled > 0) {
      await this.triggerRescheduling(userId, companyId);
    }

    logger.info('Scheduling completed', result);
    return result;
  }

  private async fetchTasksToSchedule(
    userId: string,
    companyId?: string,
    taskIds?: string[],
  ) {
    const where: any = {
      userId,
      status: 'open',
      isScheduleLocked: false,
      OR: [
        { startAt: null },
        { needsRescheduling: true },
      ],
    };

    if (companyId) {
      where.companyId = companyId;
    }

    if (taskIds && taskIds.length > 0) {
      where.id = { in: taskIds };
    }

    return this.prisma.task.findMany({
      where,
      orderBy: [
        { priorityScore: 'desc' },
        { dueDate: 'asc' },
      ],
      include: {
        project: true,
        tags: true,
      },
    });
  }

  private async fetchUserCalendar(userId: string, companyId?: string) {
    const where: any = {
      userId,
      startTime: {
        gte: new Date(),
      },
    };

    if (companyId) {
      where.companyId = companyId;
    }

    return this.prisma.calendarEvent.findMany({
      where,
      orderBy: { startTime: 'asc' },
    });
  }

  private async fetchUserPreferences(userId: string) {
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });

    return {
      workingHours: settings?.workingHours || {
        start: '09:00',
        end: '17:00',
        timezone: 'UTC',
      },
      preferredBlockSizes: settings?.preferredBlockSizes || [30, 60, 120],
    };
  }

  private async scheduleTask(
    task: any,
    calendar: any[],
    preferences: any,
    mode: string,
    dryRun?: boolean,
  ): Promise<boolean> {
    const slot = this.findOptimalSlot(task, calendar, preferences);

    if (!slot) {
      logger.warn(`No available slot found for task ${task.id}`);
      return false;
    }

    if (dryRun) {
      logger.info(`[DRY RUN] Would schedule task ${task.id} at ${slot.start}`);
      return true;
    }

    // Update task with schedule
    await this.prisma.$transaction([
      this.prisma.task.update({
        where: { id: task.id },
        data: {
          startAt: slot.start,
          dueDate: slot.end,
          needsRescheduling: false,
          lastScheduledAt: new Date(),
        },
      }),
      this.prisma.calendarEvent.create({
        data: {
          userId: task.userId,
          companyId: task.companyId,
          taskId: task.id,
          title: task.title,
          startTime: slot.start,
          endTime: slot.end,
          type: 'task',
          isLocked: false,
        },
      }),
    ]);

    return true;
  }

  private findOptimalSlot(
    task: any,
    calendar: any[],
    preferences: any,
  ): { start: Date; end: Date } | null {
    const duration = task.estimatedMinutes || 60;
    const now = new Date();
    const maxDaysAhead = 14;

    // Parse working hours
    const [startHour, startMinute] = preferences.workingHours.start.split(':').map(Number);
    const [endHour, endMinute] = preferences.workingHours.end.split(':').map(Number);

    // Try each day
    for (let day = 0; day < maxDaysAhead; day++) {
      const date = new Date(now);
      date.setDate(date.getDate() + day);
      date.setHours(startHour, startMinute, 0, 0);

      const dayEnd = new Date(date);
      dayEnd.setHours(endHour, endMinute, 0, 0);

      // Get events for this day
      const dayEvents = calendar.filter(event => {
        const eventDate = new Date(event.startTime);
        return eventDate.toDateString() === date.toDateString();
      });

      // Find first available slot
      let currentTime = new Date(date);

      // Sort events by start time
      dayEvents.sort((a, b) => 
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );

      for (const event of dayEvents) {
        const eventStart = new Date(event.startTime);
        const gap = eventStart.getTime() - currentTime.getTime();

        if (gap >= duration * 60 * 1000) {
          return {
            start: currentTime,
            end: new Date(currentTime.getTime() + duration * 60 * 1000),
          };
        }

        currentTime = new Date(event.endTime);
      }

      // Check if there's time after last event
      const remaining = dayEnd.getTime() - currentTime.getTime();
      if (remaining >= duration * 60 * 1000) {
        return {
          start: currentTime,
          end: new Date(currentTime.getTime() + duration * 60 * 1000),
        };
      }
    }

    return null;
  }

  private async triggerRescheduling(userId: string, companyId?: string) {
    // Mark other tasks as needing rescheduling
    await this.prisma.task.updateMany({
      where: {
        userId,
        companyId,
        status: 'open',
        isScheduleLocked: false,
        startAt: { not: null },
      },
      data: {
        needsRescheduling: true,
      },
    });
  }

  async setupRecurringJobs(): Promise<void> {
    // Ensure daily scheduling job exists
    await this.prisma.recurringJob.upsert({
      where: { name: 'daily-auto-schedule' },
      create: {
        name: 'daily-auto-schedule',
        type: 'scheduler',
        schedule: '0 6 * * *', // 6 AM daily
        data: {
          mode: 'unified',
          dryRun: false,
        },
        enabled: true,
        nextRunAt: new Date(),
      },
      update: {
        enabled: true,
      },
    });

    await super.setupRecurringJobs();
  }
}
