import { Request, Response, Router } from 'express';
import { TimerService } from './timer.service';
import { TimeEntriesService } from './time-entries.service';
import { authGuard } from '../auth/guards/auth.guard';
import { companyGuard } from '../../common/guards/company.guard';
import { validateDto } from '../../common/middleware/validation.middleware';
import { TimerActionDto } from './dto/timer-action.dto';
import { TimeEntryDto } from './dto/time-entry.dto';

export class TimeTrackingController {
  public router: Router = Router();
  private timerService: TimerService;
  private timeEntriesService: TimeEntriesService;

  constructor() {
    this.timerService = new TimerService();
    this.timeEntriesService = new TimeEntriesService();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    // Timer endpoints
    this.router.post(
      '/time-entries/start',
      authGuard,
      companyGuard,
      validateDto(TimerActionDto),
      this.startTimer
    );

    this.router.post(
      '/time-entries/stop',
      authGuard,
      companyGuard,
      validateDto(TimerActionDto),
      this.stopTimer
    );

    this.router.post(
      '/time-entries/pause',
      authGuard,
      companyGuard,
      validateDto(TimerActionDto),
      this.pauseTimer
    );

    // Time entries CRUD
    this.router.get(
      '/time-entries',
      authGuard,
      companyGuard,
      this.listTimeEntries
    );

    this.router.put(
      '/time-entries/:id',
      authGuard,
      companyGuard,
      validateDto(TimeEntryDto),
      this.updateTimeEntry
    );

    this.router.delete(
      '/time-entries/:id',
      authGuard,
      companyGuard,
      this.deleteTimeEntry
    );

    // Analytics endpoints
    this.router.get(
      '/time-entries/stats',
      authGuard,
      companyGuard,
      this.getTimeStats
    );

    this.router.get(
      '/time-entries/export',
      authGuard,
      companyGuard,
      this.exportTimeEntries
    );

    // Polling endpoint for timer updates
    this.router.get(
      '/timers/updates',
      authGuard,
      companyGuard,
      this.getTimerUpdates
    );

    // Timer state endpoints
    this.router.get(
      '/timers/active',
      authGuard,
      companyGuard,
      this.getActiveTimers
    );

    this.router.post(
      '/timers/sync',
      authGuard,
      companyGuard,
      this.syncTimerState
    );
  }

  /**
   * Start a timer for a task
   */
  private startTimer = async (req: Request, res: Response): Promise<void> => {
    try {
      const { taskId } = req.body;
      const userId = (req as any).user.id;
      const companyId = (req as any).company.id;

      const timer = await this.timerService.startTimer({
        taskId,
        userId,
        companyId,
      });

      res.status(200).json({
        success: true,
        data: timer,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  };

  /**
   * Stop a timer and create time entry
   */
  private stopTimer = async (req: Request, res: Response): Promise<void> => {
    try {
      const { taskId } = req.body;
      const userId = (req as any).user.id;
      const companyId = (req as any).company.id;

      const timeEntry = await this.timerService.stopTimer({
        taskId,
        userId,
        companyId,
      });

      res.status(200).json({
        success: true,
        data: timeEntry,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  };

  /**
   * Pause a running timer
   */
  private pauseTimer = async (req: Request, res: Response): Promise<void> => {
    try {
      const { taskId } = req.body;
      const userId = (req as any).user.id;

      const timer = await this.timerService.pauseTimer({
        taskId,
        userId,
      });

      res.status(200).json({
        success: true,
        data: timer,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  };

  /**
   * List time entries with filtering
   */
  private listTimeEntries = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user.id;
      const companyId = (req as any).company.id;
      const { startDate, endDate, taskId, projectId, page = 1, limit = 50 } = req.query;

      const entries = await this.timeEntriesService.listEntries({
        userId,
        companyId,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        taskId: taskId as string,
        projectId: projectId as string,
        pagination: {
          page: Number(page),
          limit: Number(limit),
        },
      });

      res.status(200).json({
        success: true,
        data: entries.data,
        meta: entries.meta,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  };

  /**
   * Update a time entry
   */
  private updateTimeEntry = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = (req as any).user.id;
      const companyId = (req as any).company.id;

      const updatedEntry = await this.timeEntriesService.updateEntry({
        id,
        userId,
        companyId,
        ...req.body,
      });

      res.status(200).json({
        success: true,
        data: updatedEntry,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  };

  /**
   * Delete a time entry
   */
  private deleteTimeEntry = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = (req as any).user.id;
      const companyId = (req as any).company.id;

      await this.timeEntriesService.deleteEntry({
        id,
        userId,
        companyId,
      });

      res.status(204).send();
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  };

  /**
   * Get time tracking statistics
   */
  private getTimeStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user.id;
      const companyId = (req as any).company.id;
      const { period = 'week', groupBy = 'day' } = req.query;

      const stats = await this.timeEntriesService.getStatistics({
        userId,
        companyId,
        period: period as 'day' | 'week' | 'month' | 'year',
        groupBy: groupBy as 'day' | 'week' | 'task' | 'project',
      });

      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  };

  /**
   * Export time entries to CSV/PDF
   */
  private exportTimeEntries = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user.id;
      const companyId = (req as any).company.id;
      const { format = 'csv', startDate, endDate } = req.query;

      const exportData = await this.timeEntriesService.exportEntries({
        userId,
        companyId,
        format: format as 'csv' | 'pdf' | 'excel',
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
      });

      res.setHeader('Content-Type', exportData.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${exportData.filename}"`);
      res.send(exportData.data);
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  };

  /**
   * Get all active timers for the user
   */
  private getActiveTimers = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).user.id;
      const companyId = (req as any).company.id;

      const timers = await this.timerService.getActiveTimers({
        userId,
        companyId,
      });

      res.status(200).json({
        success: true,
        data: timers,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  };

  /**
   * Get timer updates for polling
   */
  private getTimerUpdates = async (req: Request, res: Response): Promise<void> => {
    try {
      const companyId = (req as any).company.id;
      const { since, userId } = req.query;

      const sinceDate = since ? new Date(since as string) : new Date(Date.now() - 60000); // Default: last minute

      const updates = await this.timerService.getTimerUpdates({
        companyId,
        since: sinceDate,
        userId: userId as string,
      });

      res.status(200).json({
        success: true,
        data: updates,
        timestamp: new Date(),
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  };
}
