import { Task, TimeEntry, Meeting } from '@prisma/client';

interface ProductivityInput {
  tasks: Task[];
  timeLogs: TimeEntry[];
  meetings: Meeting[];
  dateRange?: { start: Date; end: Date };
  groupBy?: 'day' | 'week' | 'month';
}

interface ProductivityMetrics {
  tasksCompletedPerDay: number;
  timeUtilization: number;
  focusTimePercentage: number;
  velocityTrend: Array<{ date: Date; velocity: number }>;
  peakProductivityHours: Array<{ hour: number; productivity: number }>;
  averageTaskCompletionTime: number;
  multitaskingIndex: number;
}

export class ProductivityCalculator {
  calculate(input: ProductivityInput): ProductivityMetrics {
    const { tasks, timeLogs, meetings, dateRange, groupBy } = input;

    return {
      tasksCompletedPerDay: this.calculateTasksPerDay(tasks, dateRange),
      timeUtilization: this.calculateTimeUtilization(timeLogs, meetings),
      focusTimePercentage: this.calculateFocusTime(timeLogs, meetings),
      velocityTrend: this.calculateVelocityTrend(tasks, groupBy),
      peakProductivityHours: this.analyzePeakHours(timeLogs, tasks),
      averageTaskCompletionTime: this.calculateAvgCompletionTime(tasks, timeLogs),
      multitaskingIndex: this.calculateMultitaskingIndex(timeLogs)
    };
  }

  private calculateTasksPerDay(tasks: Task[], dateRange?: { start: Date; end: Date }): number {
    const completedTasks = tasks.filter(t => t.status === 'completed');
    
    if (!dateRange) {
      return completedTasks.length;
    }

    const days = this.getDaysBetween(dateRange.start, dateRange.end);
    return completedTasks.length / days;
  }

  private calculateTimeUtilization(timeLogs: TimeEntry[], meetings: Meeting[]): number {
    const totalWorkHours = 8 * 5; // Assuming 40-hour work week
    const totalLoggedTime = timeLogs.reduce((sum, log) => {
      return sum + (log.duration || 0);
    }, 0);

    const totalMeetingTime = meetings.reduce((sum, meeting) => {
      const duration = meeting.endTime.getTime() - meeting.startTime.getTime();
      return sum + (duration / 1000 / 60); // Convert to minutes
    }, 0);

    const totalProductiveTime = totalLoggedTime + totalMeetingTime;
    return (totalProductiveTime / (totalWorkHours * 60)) * 100;
  }

  private calculateFocusTime(timeLogs: TimeEntry[], meetings: Meeting[]): number {
    // Focus time = uninterrupted work sessions > 30 minutes
    const focusSessions = timeLogs.filter(log => {
      const duration = log.duration || 0;
      return duration >= 30 && !this.isInterrupted(log, meetings);
    });

    const totalFocusTime = focusSessions.reduce((sum, log) => sum + (log.duration || 0), 0);
    const totalTime = timeLogs.reduce((sum, log) => sum + (log.duration || 0), 0);

    return totalTime > 0 ? (totalFocusTime / totalTime) * 100 : 0;
  }

  private calculateVelocityTrend(tasks: Task[], groupBy?: 'day' | 'week' | 'month'): Array<{ date: Date; velocity: number }> {
    const completedTasks = tasks.filter(t => t.status === 'completed' && t.completedAt);
    const grouped = this.groupTasksByPeriod(completedTasks, groupBy || 'week');

    return Object.entries(grouped).map(([dateStr, tasks]) => ({
      date: new Date(dateStr),
      velocity: tasks.reduce((sum, task) => sum + (task.effort || 1), 0)
    }));
  }

  private analyzePeakHours(timeLogs: TimeEntry[], tasks: Task[]): Array<{ hour: number; productivity: number }> {
    const hourlyProductivity = new Map<number, { tasks: number; time: number }>();

    timeLogs.forEach(log => {
      const hour = new Date(log.startTime).getHours();
      const current = hourlyProductivity.get(hour) || { tasks: 0, time: 0 };
      
      current.time += log.duration || 0;
      if (log.taskId) {
        const task = tasks.find(t => t.id === log.taskId);
        if (task?.status === 'completed') {
          current.tasks++;
        }
      }

      hourlyProductivity.set(hour, current);
    });

    return Array.from(hourlyProductivity.entries())
      .map(([hour, data]) => ({
        hour,
        productivity: data.time > 0 ? (data.tasks / data.time) * 60 : 0 // Tasks per hour
      }))
      .sort((a, b) => b.productivity - a.productivity);
  }

  private calculateAvgCompletionTime(tasks: Task[], timeLogs: TimeEntry[]): number {
    const completedTasks = tasks.filter(t => t.status === 'completed');
    let totalTime = 0;
    let count = 0;

    completedTasks.forEach(task => {
      const taskLogs = timeLogs.filter(log => log.taskId === task.id);
      const taskTime = taskLogs.reduce((sum, log) => sum + (log.duration || 0), 0);
      
      if (taskTime > 0) {
        totalTime += taskTime;
        count++;
      }
    });

    return count > 0 ? totalTime / count : 0;
  }

  private calculateMultitaskingIndex(timeLogs: TimeEntry[]): number {
    // Sort logs by start time
    const sortedLogs = [...timeLogs].sort((a, b) => 
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    let overlaps = 0;
    
    for (let i = 0; i < sortedLogs.length - 1; i++) {
      const current = sortedLogs[i];
      const next = sortedLogs[i + 1];
      
      const currentEnd = new Date(current.startTime).getTime() + (current.duration || 0) * 60 * 1000;
      const nextStart = new Date(next.startTime).getTime();
      
      if (currentEnd > nextStart) {
        overlaps++;
      }
    }

    return sortedLogs.length > 0 ? (overlaps / sortedLogs.length) * 100 : 0;
  }

  // Helper methods
  private getDaysBetween(start: Date, end: Date): number {
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  private isInterrupted(log: TimeEntry, meetings: Meeting[]): boolean {
    const logStart = new Date(log.startTime).getTime();
    const logEnd = logStart + (log.duration || 0) * 60 * 1000;

    return meetings.some(meeting => {
      const meetingStart = meeting.startTime.getTime();
      const meetingEnd = meeting.endTime.getTime();
      
      return (meetingStart >= logStart && meetingStart <= logEnd) ||
             (meetingEnd >= logStart && meetingEnd <= logEnd);
    });
  }

  private groupTasksByPeriod(tasks: Task[], period: 'day' | 'week' | 'month'): Record<string, Task[]> {
    const grouped: Record<string, Task[]> = {};

    tasks.forEach(task => {
      if (!task.completedAt) return;
      
      const date = new Date(task.completedAt);
      let key: string;

      switch (period) {
        case 'day':
          key = date.toISOString().split('T')[0];
          break;
        case 'week':
          key = this.getWeekKey(date);
          break;
        case 'month':
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
      }

      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(task);
    });

    return grouped;
  }

  private getWeekKey(date: Date): string {
    const year = date.getFullYear();
    const week = this.getWeekNumber(date);
    return `${year}-W${String(week).padStart(2, '0')}`;
  }

  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  }
}
