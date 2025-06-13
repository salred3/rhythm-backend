import { PrismaService } from '../../../common/database/prisma.service';
import { CacheService } from '../../../common/services/cache.service';
import { DailyAggregator } from './daily.aggregator';
import { Queue } from 'bullmq';

interface MonthlyReport {
  month: Date;
  summary: {
    totalTasksCompleted: number;
    totalTimeTracked: number;
    averageDailyProductivity: number;
    topAchievements: string[];
  };
  trends: {
    productivityTrend: Array<{ week: number; score: number }>;
    completionRate: number;
    estimationAccuracy: number;
  };
  goals: {
    achieved: Array<{ goal: string; result: string }>;
    missed: Array<{ goal: string; reason: string }>;
  };
  recommendations: string[];
  yearOverYear: {
    growth: number;
    improvements: string[];
    challenges: string[];
  };
}

export class MonthlyAggregator {
  private aggregationQueue: Queue;

  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
    private dailyAggregator: DailyAggregator
  ) {
    this.aggregationQueue = new Queue('monthly-aggregation');
  }

  async generateMonthlyReport(year: number, month: number): Promise<MonthlyReport> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const dailyMetrics = await this.dailyAggregator.aggregateRange(startDate, endDate);

    const summary = await this.calculateMonthlySummary(dailyMetrics, startDate, endDate);
    const trends = await this.calculateTrends(startDate, endDate);
    const goals = await this.evaluateGoals(startDate, endDate);
    const yoy = await this.calculateYearOverYear(year, month);
    const recommendations = this.generateRecommendations(summary, trends, goals);

    const report: MonthlyReport = {
      month: startDate,
      summary,
      trends,
      goals,
      recommendations,
      yearOverYear: yoy
    };

    await this.storeMonthlyReport(report);

    const cacheKey = `monthly:${year}-${String(month).padStart(2, '0')}`;
    await this.cache.set(cacheKey, report, 2592000);

    return report;
  }

  async scheduleMonthlyAggregation(): Promise<void> {
    await this.aggregationQueue.add(
      'monthly-rollup',
      { year: new Date().getFullYear(), month: new Date().getMonth() + 1 },
      { repeat: { cron: '0 2 1 * *' } }
    );
  }

  private async calculateMonthlySummary(dailyMetrics: any[], startDate: Date, endDate: Date): Promise<MonthlyReport['summary']> {
    const totalTasksCompleted = dailyMetrics.reduce((sum, day) => sum + day.tasksCompleted, 0);
    const totalTimeTracked = dailyMetrics.reduce((sum, day) => sum + day.timeTracked, 0);
    const workDays = this.calculateWorkDays(startDate, endDate);
    const averageDailyProductivity = workDays > 0 ? Math.round((totalTasksCompleted / workDays) * 10) / 10 : 0;
    const topAchievements = await this.identifyTopAchievements(startDate, endDate);

    return { totalTasksCompleted, totalTimeTracked, averageDailyProductivity, topAchievements };
  }

  private async calculateTrends(startDate: Date, endDate: Date): Promise<MonthlyReport['trends']> {
    const weeklyScores: Array<{ week: number; score: number }> = [];
    const current = new Date(startDate);
    let week = 1;

    while (current <= endDate) {
      const weekEnd = new Date(current);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const weekScore = await this.calculateWeeklyProductivityScore(current, weekEnd > endDate ? endDate : weekEnd);
      weeklyScores.push({ week, score: weekScore });
      week++;
      current.setDate(current.getDate() + 7);
    }

    const totalTasks = await this.prisma.task.count({ where: { createdAt: { gte: startDate, lte: endDate } } });
    const completedTasks = await this.prisma.task.count({ where: { status: 'completed', completedAt: { gte: startDate, lte: endDate } } });
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const estimationAccuracy = await this.calculateMonthlyEstimationAccuracy(startDate, endDate);

    return { productivityTrend: weeklyScores, completionRate, estimationAccuracy };
  }

  private async evaluateGoals(startDate: Date, endDate: Date): Promise<MonthlyReport['goals']> {
    const goals = await this.prisma.goal.findMany({ where: { targetDate: { gte: startDate, lte: endDate } } });
    const achieved: Array<{ goal: string; result: string }> = [];
    const missed: Array<{ goal: string; reason: string }> = [];

    for (const goal of goals) {
      const progress = await this.evaluateGoalProgress(goal);
      if (progress.achieved) {
        achieved.push({ goal: goal.title, result: progress.result });
      } else {
        missed.push({ goal: goal.title, reason: progress.reason || 'Target not met' });
      }
    }

    return { achieved, missed };
  }

  private async calculateYearOverYear(year: number, month: number): Promise<MonthlyReport['yearOverYear']> {
    const lastYearStart = new Date(year - 1, month - 1, 1);
    const lastYearEnd = new Date(year - 1, month, 0);

    const lastYearTasks = await this.prisma.task.count({ where: { status: 'completed', completedAt: { gte: lastYearStart, lte: lastYearEnd } } });
    const thisYearTasks = await this.prisma.task.count({ where: { status: 'completed', completedAt: { gte: new Date(year, month - 1, 1), lte: new Date(year, month, 0) } } });
    const growth = lastYearTasks > 0 ? Math.round(((thisYearTasks - lastYearTasks) / lastYearTasks) * 100) : 100;

    const improvements: string[] = [];
    const challenges: string[] = [];
    if (growth > 20) {
      improvements.push(`${growth}% increase in task completion`);
    } else if (growth < -10) {
      challenges.push(`${Math.abs(growth)}% decrease in task completion`);
    }

    return { growth, improvements, challenges };
  }

  private generateRecommendations(summary: MonthlyReport['summary'], trends: MonthlyReport['trends'], goals: MonthlyReport['goals']): string[] {
    const recommendations: string[] = [];
    const avgProductivity = trends.productivityTrend.reduce((sum, week) => sum + week.score, 0) / trends.productivityTrend.length;
    if (avgProductivity < 50) {
      recommendations.push('Consider reviewing your workflow process to improve productivity.');
    }
    if (trends.completionRate < 70) {
      recommendations.push('Focus on completing started tasks before beginning new ones.');
    }
    if (trends.estimationAccuracy < 60) {
      recommendations.push('Your estimates need calibration. Try breaking tasks into smaller chunks.');
    }
    if (goals.missed.length > goals.achieved.length) {
      recommendations.push('Set more realistic goals or allocate more time for goal achievement.');
    }
    const avgDailyTime = summary.totalTimeTracked / 30;
    if (avgDailyTime < 240) {
      recommendations.push('Track your time more consistently to get better insights.');
    }
    return recommendations.slice(0, 5);
  }

  private calculateWorkDays(start: Date, end: Date): number {
    let count = 0;
    const current = new Date(start);
    while (current <= end) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        count++;
      }
      current.setDate(current.getDate() + 1);
    }
    return count;
  }

  private async identifyTopAchievements(start: Date, end: Date): Promise<string[]> {
    const achievements: string[] = [];
    const mostProductiveDay = await this.prisma.dailyMetrics.findFirst({
      where: { date: { gte: start, lte: end } },
      orderBy: { tasksCompleted: 'desc' }
    });
    if (mostProductiveDay && mostProductiveDay.tasksCompleted > 10) {
      achievements.push(`Completed ${mostProductiveDay.tasksCompleted} tasks on ${mostProductiveDay.date.toDateString()}`);
    }

    const streak = await this.calculateLongestStreak(start, end);
    if (streak > 5) {
      achievements.push(`Maintained a ${streak}-day productivity streak`);
    }

    const majorProjects = await this.prisma.project.findMany({
      where: { status: 'completed', updatedAt: { gte: start, lte: end } }
    });
    majorProjects.forEach(project => achievements.push(`Completed project: ${project.name}`));
    return achievements.slice(0, 5);
  }

  private async calculateWeeklyProductivityScore(start: Date, end: Date): Promise<number> {
    const tasks = await this.prisma.task.count({ where: { status: 'completed', completedAt: { gte: start, lte: end } } });
    const timeEntries = await this.prisma.timeEntry.aggregate({ where: { startTime: { gte: start, lte: end } }, _sum: { duration: true } });
    const totalTime = timeEntries._sum.duration || 0;
    const score = totalTime > 0 ? (tasks / (totalTime / 60)) * 10 : 0;
    return Math.min(100, Math.round(score));
  }

  private async calculateMonthlyEstimationAccuracy(start: Date, end: Date): Promise<number> {
    const completedTasks = await this.prisma.task.findMany({
      where: { status: 'completed', completedAt: { gte: start, lte: end }, estimatedMinutes: { gt: 0 } },
      include: { timeEntries: true }
    });
    if (completedTasks.length === 0) return 100;
    let totalAccuracy = 0;
    completedTasks.forEach(task => {
      const actualTime = task.timeEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0);
      const estimatedTime = task.estimatedMinutes || 0;
      if (estimatedTime > 0) {
        const accuracy = Math.max(0, 100 - Math.abs(actualTime - estimatedTime) / estimatedTime * 100);
        totalAccuracy += accuracy;
      }
    });
    return Math.round(totalAccuracy / completedTasks.length);
  }

  private async evaluateGoalProgress(goal: any): Promise<{ achieved: boolean; result?: string; reason?: string }> {
    const progress = goal.currentValue / goal.targetValue;
    if (progress >= 1) {
      return { achieved: true, result: `Achieved ${Math.round(progress * 100)}% of target` };
    } else {
      return { achieved: false, reason: `Only achieved ${Math.round(progress * 100)}% of target` };
    }
  }

  private async calculateLongestStreak(start: Date, end: Date): Promise<number> {
    const dailyMetrics = await this.prisma.dailyMetrics.findMany({
      where: { date: { gte: start, lte: end }, tasksCompleted: { gt: 0 } },
      orderBy: { date: 'asc' }
    });

    let maxStreak = 0;
    let currentStreak = 0;
    let lastDate: Date | null = null;

    dailyMetrics.forEach(metric => {
      if (!lastDate) {
        currentStreak = 1;
      } else {
        const dayDiff = Math.floor((metric.date.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        if (dayDiff === 1) {
          currentStreak++;
        } else {
          maxStreak = Math.max(maxStreak, currentStreak);
          currentStreak = 1;
        }
      }
      lastDate = metric.date;
    });

    return Math.max(maxStreak, currentStreak);
  }

  private async storeMonthlyReport(report: MonthlyReport): Promise<void> {
    await this.prisma.monthlyReport.upsert({
      where: { month: report.month },
      create: { month: report.month, data: JSON.stringify(report) },
      update: { data: JSON.stringify(report) }
    });
  }
}
