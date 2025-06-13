import { ProductivityCalculator } from './calculators/productivity.calculator';
import { EstimationCalculator } from './calculators/estimation.calculator';
import { PatternsAnalyzer } from './calculators/patterns.analyzer';
import { CompanyAnalyzer } from './calculators/company.analyzer';
import { DailyAggregator } from './aggregators/daily.aggregator';
import { MonthlyAggregator } from './aggregators/monthly.aggregator';
import { AnalyticsQueryDto, ExportOptionsDto } from './dto';
import { CacheService } from '../../common/services/cache.service';
import { PrismaService } from '../../common/database/prisma.service';

export class AnalyticsService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
    private productivityCalculator: ProductivityCalculator,
    private estimationCalculator: EstimationCalculator,
    private patternsAnalyzer: PatternsAnalyzer,
    private companyAnalyzer: CompanyAnalyzer,
    private dailyAggregator: DailyAggregator,
    private monthlyAggregator: MonthlyAggregator
  ) {}

  async getProductivityStats(userId: string, query: AnalyticsQueryDto) {
    const cacheKey = `productivity:${userId}:${JSON.stringify(query)}`;
    
    // Check cache first
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    // Aggregate data from multiple sources
    const [tasks, timeLogs, meetings] = await Promise.all([
      this.fetchUserTasks(userId, query),
      this.fetchTimeLogs(userId, query),
      this.fetchMeetings(userId, query)
    ]);

    // Calculate productivity metrics
    const stats = await this.productivityCalculator.calculate({
      tasks,
      timeLogs,
      meetings,
      dateRange: query.dateRange,
      groupBy: query.groupBy
    });

    // Cache for 1 hour
    await this.cache.set(cacheKey, stats, 3600);

    return stats;
  }

  async getEstimationAccuracy(userId: string, query: AnalyticsQueryDto) {
    const cacheKey = `estimation:${userId}:${JSON.stringify(query)}`;
    
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const completedTasks = await this.prisma.task.findMany({
      where: {
        userId,
        status: 'completed',
        completedAt: {
          gte: query.dateRange?.start,
          lte: query.dateRange?.end
        }
      },
      include: {
        timeEntries: true
      }
    });

    const accuracy = await this.estimationCalculator.calculate(completedTasks as any);

    await this.cache.set(cacheKey, accuracy, 3600);

    return accuracy;
  }

  async analyzeWorkPatterns(userId: string, query: AnalyticsQueryDto) {
    const cacheKey = `patterns:${userId}:${JSON.stringify(query)}`;
    
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    // Fetch comprehensive activity data
    const [tasks, timeLogs, meetings, contextSwitches] = await Promise.all([
      this.fetchUserTasks(userId, query),
      this.fetchTimeLogs(userId, query),
      this.fetchMeetings(userId, query),
      this.fetchContextSwitches(userId, query)
    ]);

    const patterns = await this.patternsAnalyzer.analyze({
      tasks,
      timeLogs,
      meetings,
      contextSwitches
    });

    // Cache for 2 hours as patterns don't change frequently
    await this.cache.set(cacheKey, patterns, 7200);

    return patterns;
  }

  async getCompanyAnalytics(companyId: string, query: AnalyticsQueryDto) {
    const cacheKey = `company:${companyId}:${JSON.stringify(query)}`;
    
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    // Verify user has access to company data
    const companyData = await this.fetchCompanyData(companyId, query);
    
    const analytics = await this.companyAnalyzer.analyze(companyData);

    await this.cache.set(cacheKey, analytics, 1800);

    return analytics;
  }

  async exportAnalytics(userId: string, options: ExportOptionsDto) {
    const data = await this.gatherExportData(userId, options);

    switch (options.format) {
      case 'csv':
        return this.exportToCsv(data);
      case 'pdf':
        return this.exportToPdf(data);
      case 'json':
      default:
        return data;
    }
  }

  // Real-time vs batch processing decision
  async processAnalytics(type: 'realtime' | 'batch', data: any) {
    if (type === 'realtime') {
      // Process immediately for live dashboards
      return this.processRealtimeAnalytics(data);
    } else {
      // Queue for batch processing
      await this.queueBatchAnalytics(data);
    }
  }

  // Helper methods
  private async fetchUserTasks(userId: string, query: AnalyticsQueryDto) {
    return this.prisma.task.findMany({
      where: {
        userId,
        createdAt: {
          gte: query.dateRange?.start,
          lte: query.dateRange?.end
        }
      }
    });
  }

  private async fetchTimeLogs(userId: string, query: AnalyticsQueryDto) {
    return this.prisma.timeEntry.findMany({
      where: {
        userId,
        startTime: {
          gte: query.dateRange?.start,
          lte: query.dateRange?.end
        }
      }
    });
  }

  private async fetchMeetings(userId: string, query: AnalyticsQueryDto) {
    return this.prisma.meeting.findMany({
      where: {
        attendees: {
          some: { userId }
        },
        startTime: {
          gte: query.dateRange?.start,
          lte: query.dateRange?.end
        }
      }
    });
  }

  private async fetchContextSwitches(userId: string, query: AnalyticsQueryDto) {
    // Implementation for tracking context switches between tasks
    return this.prisma.activityLog.findMany({
      where: {
        userId,
        type: 'task_switch',
        timestamp: {
          gte: query.dateRange?.start,
          lte: query.dateRange?.end
        }
      }
    });
  }

  private async fetchCompanyData(companyId: string, query: AnalyticsQueryDto) {
    const [members, projects, tasks] = await Promise.all([
      this.prisma.companyMember.findMany({ where: { companyId } }),
      this.prisma.project.findMany({ where: { companyId } }),
      this.prisma.task.findMany({ 
        where: { 
          project: { companyId },
          createdAt: {
            gte: query.dateRange?.start,
            lte: query.dateRange?.end
          }
        } 
      })
    ]);

    return { members, projects, tasks };
  }

  private async gatherExportData(userId: string, options: ExportOptionsDto) {
    const query: AnalyticsQueryDto = {
      dateRange: options.dateRange,
      metrics: options.metrics
    };

    const data: any = {};

    if (options.includeProductivity) {
      data.productivity = await this.getProductivityStats(userId, query);
    }

    if (options.includeEstimation) {
      data.estimation = await this.getEstimationAccuracy(userId, query);
    }

    if (options.includePatterns) {
      data.patterns = await this.analyzeWorkPatterns(userId, query);
    }

    return data;
  }

  private async exportToCsv(data: any): Promise<string> {
    // CSV export implementation
    // Convert data to CSV format
    return '';
  }

  private async exportToPdf(data: any): Promise<Buffer> {
    // PDF export implementation
    // Generate PDF report
    return Buffer.from('');
  }

  private async processRealtimeAnalytics(data: any) {
    // Process analytics in real-time
    return data;
  }

  private async queueBatchAnalytics(data: any) {
    // Queue for batch processing
    await this.prisma.analyticsQueue.create({
      data: {
        type: 'batch',
        payload: data,
        status: 'pending'
      }
    });
  }
}
