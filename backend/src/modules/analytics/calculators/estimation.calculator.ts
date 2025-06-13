import { Task, TimeEntry } from '@prisma/client';

interface EstimationAccuracyResult {
  overallAccuracy: number;
  accuracyByTaskType: Record<string, number>;
  improvementOverTime: Array<{ date: Date; accuracy: number }>;
  confidenceTrends: Array<{ period: string; confidence: number }>;
  recommendations: string[];
  deviationPatterns: {
    constantOverestimator: boolean;
    constantUnderestimator: boolean;
    pattern: 'improving' | 'declining' | 'stable';
  };
}

interface TaskWithEntries extends Task {
  timeEntries: TimeEntry[];
}

export class EstimationCalculator {
  calculate(completedTasks: TaskWithEntries[]): EstimationAccuracyResult {
    const accuracyData = this.calculateAccuracyData(completedTasks);
    const patterns = this.detectPatterns(accuracyData);
    const recommendations = this.generateRecommendations(patterns, accuracyData);

    return {
      overallAccuracy: this.calculateOverallAccuracy(accuracyData),
      accuracyByTaskType: this.calculateAccuracyByType(completedTasks),
      improvementOverTime: this.calculateImprovementTrend(completedTasks),
      confidenceTrends: this.calculateConfidenceTrends(completedTasks),
      recommendations,
      deviationPatterns: patterns
    };
  }

  private calculateAccuracyData(tasks: TaskWithEntries[]): Array<{ task: TaskWithEntries; accuracy: number; deviation: number }> {
    return tasks.map(task => {
      const actualTime = task.timeEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0);
      const estimatedTime = task.estimatedMinutes || (task.effort * 60);
      
      if (estimatedTime === 0) {
        return { task, accuracy: 0, deviation: actualTime };
      }

      const deviation = actualTime - estimatedTime;
      const accuracy = Math.max(0, 100 - (Math.abs(deviation) / estimatedTime) * 100);

      return { task, accuracy, deviation };
    });
  }

  private calculateOverallAccuracy(accuracyData: Array<{ accuracy: number }>): number {
    if (accuracyData.length === 0) return 0;
    
    const sum = accuracyData.reduce((total, data) => total + data.accuracy, 0);
    return Math.round(sum / accuracyData.length);
  }

  private calculateAccuracyByType(tasks: TaskWithEntries[]): Record<string, number> {
    const typeGroups: Record<string, Array<{ estimated: number; actual: number }>> = {};

    tasks.forEach(task => {
      const type = task.type || 'unspecified';
      if (!typeGroups[type]) typeGroups[type] = [];

      const actualTime = task.timeEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0);
      const estimatedTime = task.estimatedMinutes || (task.effort * 60);

      if (estimatedTime > 0) {
        typeGroups[type].push({ estimated: estimatedTime, actual: actualTime });
      }
    });

    const accuracyByType: Record<string, number> = {};

    Object.entries(typeGroups).forEach(([type, estimates]) => {
      if (estimates.length === 0) {
        accuracyByType[type] = 0;
        return;
      }

      const accuracies = estimates.map(({ estimated, actual }) => {
        const deviation = Math.abs(actual - estimated);
        return Math.max(0, 100 - (deviation / estimated) * 100);
      });

      accuracyByType[type] = Math.round(
        accuracies.reduce((sum, acc) => sum + acc, 0) / accuracies.length
      );
    });

    return accuracyByType;
  }

  private calculateImprovementTrend(tasks: TaskWithEntries[]): Array<{ date: Date; accuracy: number }> {
    const sortedTasks = tasks
      .filter(t => t.completedAt)
      .sort((a, b) => new Date(a.completedAt!).getTime() - new Date(b.completedAt!).getTime());

    const monthlyGroups = new Map<string, TaskWithEntries[]>();
    
    sortedTasks.forEach(task => {
      const date = new Date(task.completedAt!);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyGroups.has(monthKey)) {
        monthlyGroups.set(monthKey, []);
      }
      monthlyGroups.get(monthKey)!.push(task);
    });

    const trend: Array<{ date: Date; accuracy: number }> = [];

    monthlyGroups.forEach((monthTasks, monthKey) => {
      const accuracyData = this.calculateAccuracyData(monthTasks);
      const monthAccuracy = this.calculateOverallAccuracy(accuracyData);
      
      trend.push({
        date: new Date(monthKey + '-01'),
        accuracy: monthAccuracy
      });
    });

    return trend.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  private calculateConfidenceTrends(tasks: TaskWithEntries[]): Array<{ period: string; confidence: number }> {
    const recentTasks = tasks
      .filter(t => t.completedAt)
      .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())
      .slice(0, 50); // Last 50 tasks

    if (recentTasks.length === 0) return [];

    const windowSize = 10;
    const trends: Array<{ period: string; confidence: number }> = [];

    for (let i = 0; i <= recentTasks.length - windowSize; i += 5) {
      const window = recentTasks.slice(i, i + windowSize);
      const accuracyData = this.calculateAccuracyData(window);
      const windowAccuracy = this.calculateOverallAccuracy(accuracyData);
      
      trends.push({
        period: `Tasks ${i + 1}-${i + windowSize}`,
        confidence: Math.round(windowAccuracy)
      });
    }

    return trends;
  }

  private detectPatterns(accuracyData: Array<{ deviation: number }>): {
    constantOverestimator: boolean;
    constantUnderestimator: boolean;
    pattern: 'improving' | 'declining' | 'stable';
  } {
    const deviations = accuracyData.map(d => d.deviation);
    
    const positiveDeviations = deviations.filter(d => d > 0).length;
    const negativeDeviations = deviations.filter(d => d < 0).length;
    
    const constantOverestimator = negativeDeviations > deviations.length * 0.7;
    const constantUnderestimator = positiveDeviations > deviations.length * 0.7;

    const recentAccuracies = accuracyData.slice(-20).map(d => d.accuracy);
    const olderAccuracies = accuracyData.slice(-40, -20).map(d => d.accuracy);

    let pattern: 'improving' | 'declining' | 'stable' = 'stable';
    
    if (recentAccuracies.length > 0 && olderAccuracies.length > 0) {
      const recentAvg = recentAccuracies.reduce((sum, acc) => sum + acc, 0) / recentAccuracies.length;
      const olderAvg = olderAccuracies.reduce((sum, acc) => sum + acc, 0) / olderAccuracies.length;
      
      if (recentAvg > olderAvg + 10) pattern = 'improving';
      else if (recentAvg < olderAvg - 10) pattern = 'declining';
    }

    return { constantOverestimator, constantUnderestimator, pattern };
  }

  private generateRecommendations(
    patterns: { constantOverestimator: boolean; constantUnderestimator: boolean; pattern: string },
    accuracyData: Array<{ task: TaskWithEntries; accuracy: number; deviation: number }>
  ): string[] {
    const recommendations: string[] = [];

    if (patterns.constantOverestimator) {
      recommendations.push('You tend to overestimate task duration. Try breaking tasks into smaller chunks for better accuracy.');
    }
    
    if (patterns.constantUnderestimator) {
      recommendations.push('You often underestimate task duration. Consider adding a buffer (20-30%) to your estimates.');
    }

    if (patterns.pattern === 'improving') {
      recommendations.push('Great job! Your estimation accuracy is improving. Keep tracking your time to maintain this trend.');
    } else if (patterns.pattern === 'declining') {
      recommendations.push('Your estimation accuracy has declined recently. Review your recent tasks to identify what changed.');
    }

    const typeAccuracies = new Map<string, number[]>();
    
    accuracyData.forEach(({ task, accuracy }) => {
      const type = task.type || 'unspecified';
      if (!typeAccuracies.has(type)) typeAccuracies.set(type, []);
      typeAccuracies.get(type)!.push(accuracy);
    });

    typeAccuracies.forEach((accuracies, type) => {
      const avgAccuracy = accuracies.reduce((sum, acc) => sum + acc, 0) / accuracies.length;
      if (avgAccuracy < 50) {
        recommendations.push(`Your estimation for "${type}" tasks needs improvement (${Math.round(avgAccuracy)}% accurate).`);
      }
    });

    const morningTasks = accuracyData.filter(({ task }) => {
      const hour = new Date(task.createdAt).getHours();
      return hour >= 6 && hour < 12;
    });

    const afternoonTasks = accuracyData.filter(({ task }) => {
      const hour = new Date(task.createdAt).getHours();
      return hour >= 12 && hour < 18;
    });

    if (morningTasks.length > 10 && afternoonTasks.length > 10) {
      const morningAccuracy = this.calculateOverallAccuracy(morningTasks);
      const afternoonAccuracy = this.calculateOverallAccuracy(afternoonTasks);
      
      if (Math.abs(morningAccuracy - afternoonAccuracy) > 20) {
        const betterPeriod = morningAccuracy > afternoonAccuracy ? 'morning' : 'afternoon';
        recommendations.push(`Your estimates are more accurate in the ${betterPeriod}. Consider this when planning tasks.`);
      }
    }

    return recommendations.slice(0, 5);
  }
}
