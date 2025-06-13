import { PrismaClient } from '@prisma/client';
import { TimeEntriesService } from './time-entries.service';
import { EventEmitter } from 'events';
import { Logger } from '../../common/logger/logger.service';

interface TimerState {
  id: string;
  taskId: string;
  userId: string;
  companyId: string;
  startTime: Date;
  pausedAt?: Date;
  totalPausedDuration: number;
  isActive: boolean;
  isPaused: boolean;
}

interface StartTimerParams {
  taskId: string;
  userId: string;
  companyId: string;
}

interface StopTimerParams {
  taskId: string;
  userId: string;
  companyId: string;
}

interface PauseTimerParams {
  taskId: string;
  userId: string;
}

export class TimerService {
  private prisma: PrismaClient;
  private timeEntriesService: TimeEntriesService;
  private eventEmitter: EventEmitter;
  private logger: Logger;

  constructor() {
    this.prisma = new PrismaClient();
    this.timeEntriesService = new TimeEntriesService();
    this.eventEmitter = new EventEmitter();
    this.logger = new Logger('TimerService');

    // Initialize automatic timer stop at day end
    this.initializeDayEndHandler();
  }

  /**
   * Start a timer for a task
   */
  async startTimer(params: StartTimerParams): Promise<TimerState> {
    const { taskId, userId, companyId } = params;

    // Check if task exists and user has access
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        companyId,
        OR: [
          { assigneeId: userId },
          { createdById: userId },
          { collaborators: { some: { userId } } },
        ],
      },
    });

    if (!task) {
      throw new Error('Task not found or access denied');
    }

    // Stop any other active timers for this user (single transaction)
    const result = await this.prisma.$transaction(async (tx) => {
      // Stop active timers
      await tx.activeTimer.updateMany({
        where: {
          userId,
          isActive: true,
          isPaused: false,
        },
        data: {
          isActive: false,
          endTime: new Date(),
        },
      });

      // Create new timer
      return await tx.activeTimer.create({
        data: {
          taskId,
          userId,
          companyId,
          startTime: new Date(),
          totalPausedDuration: 0,
          isActive: true,
          isPaused: false,
        },
      });
    });

    this.logger.info(`Timer started for task ${taskId} by user ${userId}`);

    return {
      id: result.id,
      taskId: result.taskId,
      userId: result.userId,
      companyId: result.companyId,
      startTime: result.startTime,
      totalPausedDuration: result.totalPausedDuration,
      isActive: result.isActive,
      isPaused: result.isPaused,
    };
  }

  /**
   * Stop a timer and create time entry
   */
  async stopTimer(params: StopTimerParams): Promise<any> {
    const { taskId, userId, companyId } = params;

    // Get active timer from database
    const timer = await this.prisma.activeTimer.findFirst({
      where: {
        taskId,
        userId,
        companyId,
        isActive: true,
      },
    });

    if (!timer) {
      throw new Error('No active timer found for this task');
    }

    // Calculate total duration
    const endTime = new Date();
    const totalDuration = this.calculateDuration(timer, endTime);

    // Use transaction to ensure consistency
    const result = await this.prisma.$transaction(async (tx) => {
      // Mark timer as inactive
      await tx.activeTimer.update({
        where: { id: timer.id },
        data: {
          isActive: false,
          endTime,
        },
      });

      // Update task time spent
      await tx.task.update({
        where: { id: taskId },
        data: {
          timeSpent: {
            increment: totalDuration,
          },
        },
      });

      // Create time entry via service (outside transaction if it has its own)
      return { timer, totalDuration };
    });

    // Create time entry
    const timeEntry = await this.timeEntriesService.createEntry({
      taskId,
      userId,
      companyId,
      startTime: timer.startTime,
      endTime,
      duration: result.totalDuration,
      description: '',
    });

    this.logger.info(`Timer stopped for task ${taskId} by user ${userId}, duration: ${result.totalDuration}s`);

    return timeEntry;
  }

  /**
   * Pause a running timer
   */
  async pauseTimer(params: PauseTimerParams): Promise<TimerState> {
    const { taskId, userId } = params;

    const timer = await this.prisma.activeTimer.findFirst({
      where: {
        taskId,
        userId,
        isActive: true,
      },
    });

    if (!timer) {
      throw new Error('No active timer found for this task');
    }

    let updatedTimer;

    if (timer.isPaused) {
      // Resume timer
      const pauseDuration = Date.now() - new Date(timer.pausedAt!).getTime();
      
      updatedTimer = await this.prisma.activeTimer.update({
        where: { id: timer.id },
        data: {
          isPaused: false,
          pausedAt: null,
          totalPausedDuration: {
            increment: pauseDuration,
          },
        },
      });
    } else {
      // Pause timer
      updatedTimer = await this.prisma.activeTimer.update({
        where: { id: timer.id },
        data: {
          isPaused: true,
          pausedAt: new Date(),
        },
      });
    }

    return {
      id: updatedTimer.id,
      taskId: updatedTimer.taskId,
      userId: updatedTimer.userId,
      companyId: updatedTimer.companyId,
      startTime: updatedTimer.startTime,
      pausedAt: updatedTimer.pausedAt || undefined,
      totalPausedDuration: updatedTimer.totalPausedDuration,
      isActive: updatedTimer.isActive,
      isPaused: updatedTimer.isPaused,
    };
  }

  /**
   * Get all active timers for a user
   */
  async getActiveTimers(params: { userId: string; companyId: string }): Promise<TimerState[]> {
    const { userId, companyId } = params;
    
    const timers = await this.prisma.activeTimer.findMany({
      where: {
        userId,
        companyId,
        isActive: true,
      },
      include: {
        task: {
          select: {
            title: true,
            project: {
              select: {
                name: true,
                color: true,
              },
            },
          },
        },
      },
    });

    return timers.map(timer => ({
      id: timer.id,
      taskId: timer.taskId,
      userId: timer.userId,
      companyId: timer.companyId,
      startTime: timer.startTime,
      pausedAt: timer.pausedAt || undefined,
      totalPausedDuration: timer.totalPausedDuration,
      isActive: timer.isActive,
      isPaused: timer.isPaused,
      currentDuration: this.calculateDuration(timer, new Date()),
    }));
  }

  /**
   * Get timer updates since a timestamp (for polling)
   */
  async getTimerUpdates(params: {
    companyId: string;
    since: Date;
    userId?: string;
  }): Promise<any[]> {
    const { companyId, since, userId } = params;

    const where: any = {
      companyId,
      updatedAt: { gt: since },
    };

    if (userId) {
      where.userId = userId;
    }

    const updates = await this.prisma.activeTimer.findMany({
      where,
      include: {
        task: {
          select: {
            title: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return updates.map(timer => ({
      ...timer,
      currentDuration: timer.isActive ? this.calculateDuration(timer, new Date()) : null,
      eventType: timer.isActive ? 'timer_updated' : 'timer_stopped',
    }));
  }

  /**
   * Get timer state for multiple users (for dashboard)
   */
  async getMultipleUserTimers(userIds: string[]): Promise<Map<string, TimerState[]>> {
    const timers = await this.prisma.activeTimer.findMany({
      where: {
        userId: { in: userIds },
        isActive: true,
      },
    });

    const userTimers = new Map<string, TimerState[]>();

    for (const userId of userIds) {
      const userTimerStates = timers
        .filter(t => t.userId === userId)
        .map(timer => ({
          id: timer.id,
          taskId: timer.taskId,
          userId: timer.userId,
          companyId: timer.companyId,
          startTime: timer.startTime,
          pausedAt: timer.pausedAt || undefined,
          totalPausedDuration: timer.totalPausedDuration,
          isActive: timer.isActive,
          isPaused: timer.isPaused,
          currentDuration: this.calculateDuration(timer, new Date()),
        }));
      
      userTimers.set(userId, userTimerStates);
    }

    return userTimers;
  }

  /**
   * Sync timer state from client (for offline support)
   */
  async syncTimerState(params: { userId: string; timers: any[] }): Promise<TimerState[]> {
    const { userId, timers } = params;
    const syncedTimers: TimerState[] = [];

    for (const clientTimer of timers) {
      const serverTimer = await this.prisma.activeTimer.findFirst({
        where: {
          taskId: clientTimer.taskId,
          userId,
          isActive: true,
        },
      });

      if (serverTimer) {
        // Merge with server state
        const mergedTimer = await this.mergeTimerStates(serverTimer, clientTimer);
        syncedTimers.push(mergedTimer);
      } else {
        // Client has timer that server doesn't know about
        if (clientTimer.isActive) {
          const newTimer = await this.startTimer({
            taskId: clientTimer.taskId,
            userId,
            companyId: clientTimer.companyId,
          });
          syncedTimers.push(newTimer);
        }
      }
    }

    return syncedTimers;
  }

  /**
   * Stop all active timers for a user
   */
  private async stopAllActiveTimers(userId: string): Promise<void> {
    const activeTimers = await this.prisma.activeTimer.findMany({
      where: {
        userId,
        isActive: true,
        isPaused: false,
      },
    });

    for (const timer of activeTimers) {
      await this.stopTimer({
        taskId: timer.taskId,
        userId: timer.userId,
        companyId: timer.companyId,
      });
    }
  }

  /**
   * Calculate duration accounting for pauses
   */
  private calculateDuration(timer: any, endTime: Date): number {
    const startMs = new Date(timer.startTime).getTime();
    const endMs = endTime.getTime();
    let totalMs = endMs - startMs;

    // Subtract paused duration
    totalMs -= timer.totalPausedDuration;

    // If currently paused, subtract current pause duration
    if (timer.isPaused && timer.pausedAt) {
      const currentPauseDuration = endMs - new Date(timer.pausedAt).getTime();
      totalMs -= currentPauseDuration;
    }

    return Math.floor(totalMs / 1000); // Return in seconds
  }

  /**
   * Merge client and server timer states
   */
  private async mergeTimerStates(serverTimer: any, clientTimer: any): Promise<TimerState> {
    // Server state takes precedence, but we consider client's pause state
    const mergedData = {
      isPaused: clientTimer.isPaused || serverTimer.isPaused,
      totalPausedDuration: Math.max(
        serverTimer.totalPausedDuration,
        clientTimer.totalPausedDuration || 0
      ),
    };

    const updated = await this.prisma.activeTimer.update({
      where: { id: serverTimer.id },
      data: mergedData,
    });

    return {
      id: updated.id,
      taskId: updated.taskId,
      userId: updated.userId,
      companyId: updated.companyId,
      startTime: updated.startTime,
      pausedAt: updated.pausedAt || undefined,
      totalPausedDuration: updated.totalPausedDuration,
      isActive: updated.isActive,
      isPaused: updated.isPaused,
    };
  }

  /**
   * Initialize automatic timer stop at day end
   */
  private initializeDayEndHandler(): void {
    // Schedule job to run at midnight
    const scheduleNextDayEnd = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const msUntilMidnight = tomorrow.getTime() - now.getTime();

      setTimeout(async () => {
        await this.stopAllTimersAtDayEnd();
        scheduleNextDayEnd(); // Schedule for next day
      }, msUntilMidnight);
    };

    scheduleNextDayEnd();
  }

  /**
   * Stop all active timers at day end
   */
  private async stopAllTimersAtDayEnd(): Promise<void> {
    this.logger.info('Running day-end timer cleanup');

    const activeTimers = await this.prisma.activeTimer.findMany({
      where: {
        isActive: true,
      },
    });

    for (const timer of activeTimers) {
      try {
        await this.stopTimer({
          taskId: timer.taskId,
          userId: timer.userId,
          companyId: timer.companyId,
        });

        // Create notification for user
        await this.prisma.notification.create({
          data: {
            userId: timer.userId,
            type: 'timer_auto_stopped',
            title: 'Timer automatically stopped',
            message: 'Your timer was automatically stopped at the end of the day',
            data: {
              taskId: timer.taskId,
              reason: 'day_end',
            },
          },
        });
      } catch (error) {
        this.logger.error(`Failed to stop timer ${timer.id}:`, error);
      }
    }
  }

  /**
   * Auto-pause inactive timers (called by cron job)
   */
  async autoPauseInactiveTimers(): Promise<void> {
    const inactiveThreshold = 10 * 60 * 1000; // 10 minutes
    const cutoffTime = new Date(Date.now() - inactiveThreshold);

    // Find timers that haven't been updated recently
    const inactiveTimers = await this.prisma.activeTimer.findMany({
      where: {
        isActive: true,
        isPaused: false,
        updatedAt: {
          lt: cutoffTime,
        },
      },
    });

    for (const timer of inactiveTimers) {
      await this.pauseTimer({
        taskId: timer.taskId,
        userId: timer.userId,
      });

      await this.prisma.notification.create({
        data: {
          userId: timer.userId,
          type: 'timer_auto_paused',
          title: 'Timer paused due to inactivity',
          message: 'Your timer was paused after 10 minutes of inactivity',
          data: {
            taskId: timer.taskId,
            reason: 'idle',
          },
        },
      });
    }

    this.logger.info(`Auto-paused ${inactiveTimers.length} inactive timers`);
  }
}
