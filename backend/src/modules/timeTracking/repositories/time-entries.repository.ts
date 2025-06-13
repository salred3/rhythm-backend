import { PrismaClient } from '@prisma/client';
import { Logger } from '../../../common/logger/logger.service';

interface AggregationParams {
  userId: string;
  companyId: string;
  startDate: Date;
  endDate: Date;
  groupBy: 'day' | 'week' | 'task' | 'project';
}

interface ProductivityInsightsParams {
  userId: string;
  companyId: string;
  startDate: Date;
  endDate: Date;
}

interface TimeAggregation {
  date?: Date;
  week?: string;
  taskId?: string;
  taskTitle?: string;
  projectId?: string;
  projectName?: string;
  duration: number;
  count: number;
}

interface ProductivityInsights {
  averageSessionLength: number;
  mostProductiveTimeOfDay: string;
  longestSession: {
    duration: number;
    taskId: string;
    taskTitle: string;
    date: Date;
  };
  focusScore: number;
  consistencyScore: number;
  velocityTrend: number;
}

export class TimeEntriesRepository {
  private prisma: PrismaClient;
  private logger: Logger;

  constructor() {
    this.prisma = new PrismaClient();
    this.logger = new Logger('TimeEntriesRepository');
  }

  /**
   * Get aggregated time statistics
   */
  async getAggregatedStats(params: AggregationParams): Promise<TimeAggregation[]> {
    const { userId, companyId, startDate, endDate, groupBy } = params;

    switch (groupBy) {
      case 'day':
        return this.aggregateByDay({ userId, companyId, startDate, endDate });
      case 'week':
        return this.aggregateByWeek({ userId, companyId, startDate, endDate });
      case 'task':
        return this.aggregateByTask({ userId, companyId, startDate, endDate });
      case 'project':
        return this.aggregateByProject({ userId, companyId, startDate, endDate });
      default:
        throw new Error(`Invalid groupBy parameter: ${groupBy}`);
    }
  }

  /**
   * Get productivity insights
   */
  async getProductivityInsights(params: ProductivityInsightsParams): Promise<ProductivityInsights> {
    const { userId, companyId, startDate, endDate } = params;

    const [
      averageSessionLength,
      mostProductiveTimeOfDay,
      longestSession,
      focusScore,
      consistencyScore,
      velocityTrend,
    ] = await Promise.all([
      this.calculateAverageSessionLength({ userId, companyId, startDate, endDate }),
      this.findMostProductiveTimeOfDay({ userId, companyId, startDate, endDate }),
      this.findLongestSession({ userId, companyId, startDate, endDate }),
      this.calculateFocusScore({ userId, companyId, startDate, endDate }),
      this.calculateConsistencyScore({ userId, companyId, startDate, endDate }),
      this.calculateVelocityTrend({ userId, companyId, startDate, endDate }),
    ]);

    return {
      averageSessionLength,
      mostProductiveTimeOfDay,
      longestSession,
      focusScore,
      consistencyScore,
      velocityTrend,
    };
  }

  /**
   * Aggregate by day
   */
  private async aggregateByDay(params: {
    userId: string;
    companyId: string;
    startDate: Date;
    endDate: Date;
  }): Promise<TimeAggregation[]> {
    const result = await this.prisma.$queryRaw<any[]>`
      SELECT 
        DATE(start_time) as date,
        SUM(duration) as total_duration,
        COUNT(*) as entry_count
      FROM time_entries
      WHERE user_id = ${params.userId}
        AND company_id = ${params.companyId}
        AND start_time >= ${params.startDate}
        AND start_time <= ${params.endDate}
      GROUP BY DATE(start_time)
      ORDER BY date DESC
    `;

    return result.map(row => ({
      date: new Date(row.date),
      duration: Number(row.total_duration),
      count: Number(row.entry_count),
    }));
  }

  /**
   * Aggregate by week
   */
  private async aggregateByWeek(params: {
    userId: string;
    companyId: string;
    startDate: Date;
    endDate: Date;
  }): Promise<TimeAggregation[]> {
    const result = await this.prisma.$queryRaw<any[]>`
      SELECT 
        DATE_TRUNC('week', start_time) as week_start,
        SUM(duration) as total_duration,
        COUNT(*) as entry_count
      FROM time_entries
      WHERE user_id = ${params.userId}
        AND company_id = ${params.companyId}
        AND start_time >= ${params.startDate}
        AND start_time <= ${params.endDate}
      GROUP BY DATE_TRUNC('week', start_time)
      ORDER BY week_start DESC
    `;

    return result.map(row => ({
      week: new Date(row.week_start).toISOString().split('T')[0],
      duration: Number(row.total_duration),
      count: Number(row.entry_count),
    }));
  }

  /**
   * Aggregate by task
   */
  private async aggregateByTask(params: {
    userId: string;
    companyId: string;
    startDate: Date;
    endDate: Date;
  }): Promise<TimeAggregation[]> {
    const result = await this.prisma.timeEntry.groupBy({
      by: ['taskId'],
      where: {
        userId: params.userId,
        companyId: params.companyId,
        startTime: {
          gte: params.startDate,
          lte: params.endDate,
        },
      },
      _sum: {
        duration: true,
      },
      _count: true,
    });

    // Get task details
    const taskIds = result.map(r => r.taskId);
    const tasks = await this.prisma.task.findMany({
      where: { id: { in: taskIds } },
      select: { id: true, title: true },
    });

    const taskMap = new Map(tasks.map(t => [t.id, t.title]));

    return result.map(row => ({
      taskId: row.taskId,
      taskTitle: taskMap.get(row.taskId) || 'Unknown Task',
      duration: (row as any)._sum.duration || 0,
      count: (row as any)._count,
    }));
  }

  /**
   * Aggregate by project
   */
  private async aggregateByProject(params: {
    userId: string;
    companyId: string;
    startDate: Date;
    endDate: Date;
  }): Promise<TimeAggregation[]> {
    const result = await this.prisma.$queryRaw<any[]>`
      SELECT 
        t.project_id,
        p.name as project_name,
        SUM(te.duration) as total_duration,
        COUNT(te.*) as entry_count
      FROM time_entries te
      JOIN tasks t ON te.task_id = t.id
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE te.user_id = ${params.userId}
        AND te.company_id = ${params.companyId}
        AND te.start_time >= ${params.startDate}
        AND te.start_time <= ${params.endDate}
      GROUP BY t.project_id, p.name
      ORDER BY total_duration DESC
    `;

    return result.map(row => ({
      projectId: row.project_id,
      projectName: row.project_name || 'No Project',
      duration: Number(row.total_duration),
      count: Number(row.entry_count),
    }));
  }

  /**
   * Calculate average session length
   */
  private async calculateAverageSessionLength(params: {
    userId: string;
    companyId: string;
    startDate: Date;
    endDate: Date;
  }): Promise<number> {
    const result = await this.prisma.timeEntry.aggregate({
      where: {
        userId: params.userId,
        companyId: params.companyId,
        startTime: {
          gte: params.startDate,
          lte: params.endDate,
        },
      },
      _avg: {
        duration: true,
      },
    });

    return (result as any)._avg.duration || 0;
  }

  /**
   * Find most productive time of day
   */
  private async findMostProductiveTimeOfDay(params: {
    userId: string;
    companyId: string;
    startDate: Date;
    endDate: Date;
  }): Promise<string> {
    const result = await this.prisma.$queryRaw<any[]>`
      SELECT 
        EXTRACT(HOUR FROM start_time) as hour,
        SUM(duration) as total_duration,
        COUNT(*) as session_count
      FROM time_entries
      WHERE user_id = ${params.userId}
        AND company_id = ${params.companyId}
        AND start_time >= ${params.startDate}
        AND start_time <= ${params.endDate}
      GROUP BY EXTRACT(HOUR FROM start_time)
      ORDER BY total_duration DESC
      LIMIT 1
    `;

    if (result.length === 0) return '9 AM - 10 AM';

    const hour = Number(result[0].hour);
    const period = hour < 12 ? 'AM' : 'PM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    
    return `${displayHour} ${period} - ${displayHour + 1} ${period}`;
  }

  /**
   * Find longest session
   */
  private async findLongestSession(params: {
    userId: string;
    companyId: string;
    startDate: Date;
    endDate: Date;
  }): Promise<any> {
    const entry = await this.prisma.timeEntry.findFirst({
      where: {
        userId: params.userId,
        companyId: params.companyId,
        startTime: {
          gte: params.startDate,
          lte: params.endDate,
        },
      },
      orderBy: {
        duration: 'desc',
      },
      include: {
        task: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    if (!entry) {
      return {
        duration: 0,
        taskId: '',
        taskTitle: 'No sessions found',
        date: new Date(),
      };
    }

    return {
      duration: entry.duration,
      taskId: entry.task.id,
      taskTitle: entry.task.title,
      date: entry.startTime,
    };
  }

  /**
   * Calculate focus score (0-100)
   */
  private async calculateFocusScore(params: {
    userId: string;
    companyId: string;
    startDate: Date;
    endDate: Date;
  }): Promise<number> {
    const entries = await this.prisma.timeEntry.findMany({
      where: {
        userId: params.userId,
        companyId: params.companyId,
        startTime: {
          gte: params.startDate,
          lte: params.endDate,
        },
      },
      orderBy: {
        startTime: 'asc',
      },
      include: {
        task: {
          select: {
            projectId: true,
          },
        },
      },
    });

    if (entries.length === 0) return 50;

    // Calculate average session length score
    const avgDuration = entries.reduce((sum, e) => sum + e.duration, 0) / entries.length;
    const sessionLengthScore = Math.min(avgDuration / 7200, 1) * 40; // 2 hours = perfect

    // Calculate context switches
    let contextSwitches = 0;
    for (let i = 1; i < entries.length; i++) {
      if (entries[i].task.projectId !== entries[i - 1].task.projectId) {
        contextSwitches++;
      }
    }
    const switchRatio = contextSwitches / entries.length;
    const contextScore = (1 - Math.min(switchRatio, 1)) * 30;

    // Calculate time gaps score
    let totalGapTime = 0;
    for (let i = 1; i < entries.length; i++) {
      const gap = entries[i].startTime.getTime() - entries[i - 1].endTime.getTime();
      totalGapTime += Math.max(0, gap);
    }
    const avgGap = totalGapTime / (entries.length - 1);
    const gapScore = Math.max(0, 1 - (avgGap / (4 * 60 * 60 * 1000))) * 30; // 4 hours = 0 score

    return Math.round(sessionLengthScore + contextScore + gapScore);
  }

  /**
   * Calculate consistency score (0-100)
   */
  private async calculateConsistencyScore(params: {
    userId: string;
    companyId: string;
    startDate: Date;
    endDate: Date;
  }): Promise<number> {
    const dailyStats = await this.aggregateByDay(params);

    if (dailyStats.length < 2) return 50;

    const durations = dailyStats.map(d => d.duration);
    const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    
    const variance = durations.reduce((sum, d) => sum + Math.pow(d - avgDuration, 2), 0) / durations.length;
    const stdDev = Math.sqrt(variance);
    
    const cv = avgDuration > 0 ? stdDev / avgDuration : 1;
    
    const score = Math.max(0, 100 - (cv * 100));
    
    return Math.round(score);
  }

  /**
   * Calculate velocity trend (-100 to +100)
   */
  private async calculateVelocityTrend(params: {
    userId: string;
    companyId: string;
    startDate: Date;
    endDate: Date;
  }): Promise<number> {
    const weeklyStats = await this.aggregateByWeek(params);

    if (weeklyStats.length < 2) return 0;

    const weeks = weeklyStats.map((_, i) => i);
    const durations = weeklyStats.map(w => w.duration);

    const n = weeks.length;
    const sumX = weeks.reduce((sum, x) => sum + x, 0);
    const sumY = durations.reduce((sum, y) => sum + y, 0);
    const sumXY = weeks.reduce((sum, x, i) => sum + x * durations[i], 0);
    const sumX2 = weeks.reduce((sum, x) => sum + x * x, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    
    const avgDuration = sumY / n;
    const normalizedSlope = avgDuration > 0 ? (slope / avgDuration) * 100 : 0;
    
    return Math.max(-100, Math.min(100, Math.round(normalizedSlope)));
  }

  /**
   * Get export query data
   */
  async getExportData(params: {
    userId: string;
    companyId: string;
    startDate?: Date;
    endDate?: Date;
    format: 'detailed' | 'summary';
  }): Promise<any[]> {
    const where: any = {
      userId: params.userId,
      companyId: params.companyId,
    };

    if (params.startDate) where.startTime = { gte: params.startDate };
    if (params.endDate) {
      where.startTime = where.startTime || {};
      where.startTime.lte = params.endDate;
    }

    if (params.format === 'detailed') {
      return this.prisma.timeEntry.findMany({
        where,
        include: {
          task: {
            include: {
              project: {
                select: {
                  name: true,
                  color: true,
                },
              },
            },
          },
        },
        orderBy: {
          startTime: 'desc',
        },
      });
    } else {
      return this.prisma.$queryRaw`
        SELECT 
          p.name as project_name,
          t.title as task_title,
          SUM(te.duration) as total_duration,
          COUNT(te.*) as entry_count,
          MIN(te.start_time) as first_entry,
          MAX(te.end_time) as last_entry
        FROM time_entries te
        JOIN tasks t ON te.task_id = t.id
        LEFT JOIN projects p ON t.project_id = p.id
        WHERE te.user_id = ${params.userId}
          AND te.company_id = ${params.companyId}
          ${params.startDate ? `AND te.start_time >= ${params.startDate}` : ''}
          ${params.endDate ? `AND te.start_time <= ${params.endDate}` : ''}
        GROUP BY p.name, t.title
        ORDER BY total_duration DESC
      `;
    }
  }
}
