import { Task, TimeEntry, Meeting, ActivityLog } from '@prisma/client';

interface WorkPatternInput {
  tasks: Task[];
  timeLogs: TimeEntry[];
  meetings: Meeting[];
  contextSwitches: ActivityLog[];
}

interface WorkPatterns {
  peakProductivityHours: Array<{ hour: number; score: number }>;
  taskTypePreferences: Array<{ type: string; preference: number }>;
  contextSwitchingFrequency: {
    average: number;
    byHour: Array<{ hour: number; switches: number }>;
    impact: 'low' | 'medium' | 'high';
  };
  meetingImpact: {
    productivityBeforeMeetings: number;
    productivityAfterMeetings: number;
    optimalMeetingTimes: Array<{ hour: number; impact: number }>;
  };
  workRhythm: {
    averageSessionLength: number;
    breakPatterns: Array<{ afterMinutes: number; breakLength: number }>;
    sustainedFocusPeriods: number;
  };
  recommendations: string[];
}

export class PatternsAnalyzer {
  analyze(input: WorkPatternInput): WorkPatterns {
    const peakHours = this.analyzePeakProductivityHours(input.tasks, input.timeLogs);
    const preferences = this.analyzeTaskTypePreferences(input.tasks, input.timeLogs);
    const switching = this.analyzeContextSwitching(input.contextSwitches, input.timeLogs);
    const meetingImpact = this.analyzeMeetingImpact(input.meetings, input.timeLogs, input.tasks);
    const rhythm = this.analyzeWorkRhythm(input.timeLogs);
    
    const recommendations = this.generateRecommendations({
      peakHours,
      preferences,
      switching,
      meetingImpact,
      rhythm
    });

    return {
      peakProductivityHours: peakHours,
      taskTypePreferences: preferences,
      contextSwitchingFrequency: switching,
      meetingImpact,
      workRhythm: rhythm,
      recommendations
    };
  }

  private analyzePeakProductivityHours(tasks: Task[], timeLogs: TimeEntry[]): Array<{ hour: number; score: number }> {
    const hourlyData = new Map<number, { completedTasks: number; totalTime: number; efficiency: number }>();

    for (let hour = 0; hour < 24; hour++) {
      hourlyData.set(hour, { completedTasks: 0, totalTime: 0, efficiency: 0 });
    }

    timeLogs.forEach(log => {
      const hour = new Date(log.startTime).getHours();
      const data = hourlyData.get(hour)!;
      
      data.totalTime += log.duration || 0;
      
      if (log.taskId) {
        const task = tasks.find(t => t.id === log.taskId);
        if (task?.status === 'completed') {
          data.completedTasks++;
          const estimated = task.estimatedMinutes || (task.effort * 60);
          if (estimated > 0) {
            const efficiency = Math.min(100, (estimated / (log.duration || 1)) * 100);
            data.efficiency += efficiency;
          }
        }
      }
    });

    return Array.from(hourlyData.entries())
      .map(([hour, data]) => {
        let score = 0;
        
        if (data.totalTime > 0) {
          const completionRate = (data.completedTasks / data.totalTime) * 60;
          score += completionRate * 40;
          const avgEfficiency = data.completedTasks > 0 ? data.efficiency / data.completedTasks : 0;
          score += avgEfficiency * 0.3;
          const timeScore = Math.min(100, (data.totalTime / 60) * 20);
          score += timeScore * 0.3;
        }

        return { hour, score: Math.round(score) };
      })
      .sort((a, b) => b.score - a.score);
  }

  private analyzeTaskTypePreferences(tasks: Task[], timeLogs: TimeEntry[]): Array<{ type: string; preference: number }> {
    const typeData = new Map<string, { count: number; totalTime: number; completionRate: number }>();

    tasks.forEach(task => {
      const type = task.type || 'unspecified';
      if (!typeData.has(type)) {
        typeData.set(type, { count: 0, totalTime: 0, completionRate: 0 });
      }

      const data = typeData.get(type)!;
      data.count++;

      if (task.status === 'completed') {
        data.completionRate++;
      }

      const taskTime = timeLogs
        .filter(log => log.taskId === task.id)
        .reduce((sum, log) => sum + (log.duration || 0), 0);
      
      data.totalTime += taskTime;
    });

    return Array.from(typeData.entries())
      .map(([type, data]) => {
        const completionRate = data.count > 0 ? (data.completionRate / data.count) * 100 : 0;
        const avgTimePerTask = data.count > 0 ? data.totalTime / data.count : 0;
        const preference = (completionRate * 0.6) + Math.min(40, (avgTimePerTask / 30) * 40);
        return { type, preference: Math.round(preference) };
      })
      .sort((a, b) => b.preference - a.preference);
  }

  private analyzeContextSwitching(contextSwitches: ActivityLog[], timeLogs: TimeEntry[]): {
    average: number;
    byHour: Array<{ hour: number; switches: number }>;
    impact: 'low' | 'medium' | 'high';
  } {
    const totalHours = timeLogs.reduce((sum, log) => sum + ((log.duration || 0) / 60), 0);
    const average = totalHours > 0 ? contextSwitches.length / totalHours : 0;

    const byHour = new Map<number, number>();
    for (let hour = 0; hour < 24; hour++) {
      byHour.set(hour, 0);
    }

    contextSwitches.forEach(switch_ => {
      const hour = new Date(switch_.timestamp).getHours();
      byHour.set(hour, (byHour.get(hour) || 0) + 1);
    });

    const hourlyData = Array.from(byHour.entries())
      .map(([hour, switches]) => ({ hour, switches }))
      .sort((a, b) => a.hour - b.hour);

    let impact: 'low' | 'medium' | 'high';
    if (average < 2) impact = 'low';
    else if (average < 4) impact = 'medium';
    else impact = 'high';

    return { average: Math.round(average * 10) / 10, byHour: hourlyData, impact };
  }

  private analyzeMeetingImpact(meetings: Meeting[], timeLogs: TimeEntry[], tasks: Task[]): {
    productivityBeforeMeetings: number;
    productivityAfterMeetings: number;
    optimalMeetingTimes: Array<{ hour: number; impact: number }>;
  } {
    const beforeMeetingData: number[] = [];
    const afterMeetingData: number[] = [];
    const meetingTimeImpact = new Map<number, number[]>();

    meetings.forEach(meeting => {
      const meetingStart = meeting.startTime.getTime();
      const meetingEnd = meeting.endTime.getTime();
      const meetingHour = meeting.startTime.getHours();

      const twoBefore = meetingStart - (2 * 60 * 60 * 1000);
      const twoAfter = meetingEnd + (2 * 60 * 60 * 1000);

      const tasksBefore = tasks.filter(task => {
        if (task.status !== 'completed' || !task.completedAt) return false;
        const completedTime = new Date(task.completedAt).getTime();
        return completedTime >= twoBefore && completedTime < meetingStart;
      }).length;

      const tasksAfter = tasks.filter(task => {
        if (task.status !== 'completed' || !task.completedAt) return false;
        const completedTime = new Date(task.completedAt).getTime();
        return completedTime >= meetingEnd && completedTime < twoAfter;
      }).length;

      beforeMeetingData.push(tasksBefore);
      afterMeetingData.push(tasksAfter);

      if (!meetingTimeImpact.has(meetingHour)) {
        meetingTimeImpact.set(meetingHour, []);
      }
      meetingTimeImpact.get(meetingHour)!.push(tasksAfter - tasksBefore);
    });

    const avgBefore = beforeMeetingData.length > 0
      ? beforeMeetingData.reduce((sum, val) => sum + val, 0) / beforeMeetingData.length
      : 0;
    
    const avgAfter = afterMeetingData.length > 0
      ? afterMeetingData.reduce((sum, val) => sum + val, 0) / afterMeetingData.length
      : 0;

    const optimalTimes = Array.from(meetingTimeImpact.entries())
      .map(([hour, impacts]) => {
        const avgImpact = impacts.reduce((sum, val) => sum + val, 0) / impacts.length;
        return { hour, impact: Math.round(avgImpact * 10) / 10 };
      })
      .sort((a, b) => b.impact - a.impact);

    return {
      productivityBeforeMeetings: Math.round(avgBefore * 10) / 10,
      productivityAfterMeetings: Math.round(avgAfter * 10) / 10,
      optimalMeetingTimes: optimalTimes
    };
  }

  private analyzeWorkRhythm(timeLogs: TimeEntry[]): {
    averageSessionLength: number;
    breakPatterns: Array<{ afterMinutes: number; breakLength: number }>;
    sustainedFocusPeriods: number;
  } {
    const sortedLogs = [...timeLogs].sort((a, b) => 
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    const sessionLengths: number[] = [];
    const breakPatterns: Array<{ afterMinutes: number; breakLength: number }> = [];
    let sustainedFocusPeriods = 0;

    sortedLogs.forEach((log, index) => {
      const duration = log.duration || 0;
      sessionLengths.push(duration);

      if (duration > 90) {
        sustainedFocusPeriods++;
      }

      if (index < sortedLogs.length - 1) {
        const nextLog = sortedLogs[index + 1];
        const currentEnd = new Date(log.startTime).getTime() + (duration * 60 * 1000);
        const nextStart = new Date(nextLog.startTime).getTime();
        const breakLength = (nextStart - currentEnd) / (60 * 1000);

        if (breakLength > 5 && breakLength < 60) {
          breakPatterns.push({
            afterMinutes: duration,
            breakLength: Math.round(breakLength)
          });
        }
      }
    });

    const avgSessionLength = sessionLengths.length > 0
      ? sessionLengths.reduce((sum, len) => sum + len, 0) / sessionLengths.length
      : 0;

    const groupedBreaks = this.groupBreakPatterns(breakPatterns);

    return {
      averageSessionLength: Math.round(avgSessionLength),
      breakPatterns: groupedBreaks,
      sustainedFocusPeriods
    };
  }

  private groupBreakPatterns(patterns: Array<{ afterMinutes: number; breakLength: number }>): Array<{ afterMinutes: number; breakLength: number }> {
    const ranges = [30, 60, 90, 120];
    const grouped = new Map<number, number[]>();

    patterns.forEach(pattern => {
      const range = ranges.find(r => pattern.afterMinutes <= r) || 180;
      if (!grouped.has(range)) {
        grouped.set(range, []);
      }
      grouped.get(range)!.push(pattern.breakLength);
    });

    return Array.from(grouped.entries())
      .map(([afterMinutes, breaks]) => ({
        afterMinutes,
        breakLength: Math.round(breaks.reduce((sum, b) => sum + b, 0) / breaks.length)
      }))
      .sort((a, b) => a.afterMinutes - b.afterMinutes);
  }

  private generateRecommendations(analysis: any): string[] {
    const recommendations: string[] = [];

    const topHours = analysis.peakHours.slice(0, 3);
    if (topHours.length > 0) {
      const hourRanges = this.formatHourRanges(topHours.map(h => h.hour));
      recommendations.push(`Schedule your most important tasks during ${hourRanges} when you're most productive.`);
    }

    if (analysis.switching.impact === 'high') {
      recommendations.push('You switch contexts frequently. Try batching similar tasks together to improve focus.');
    } else if (analysis.switching.impact === 'low') {
      recommendations.push('Great job maintaining focus! Your low context-switching helps productivity.');
    }

    if (analysis.meetingImpact.productivityAfterMeetings < analysis.meetingImpact.productivityBeforeMeetings * 0.7) {
      recommendations.push('Meetings significantly impact your productivity. Consider scheduling them at day\'s end.');
    }

    if (analysis.rhythm.averageSessionLength < 30) {
      recommendations.push('Your work sessions are quite short. Try extending focus periods to 45-90 minutes.');
    } else if (analysis.rhythm.sustainedFocusPeriods > 5) {
      recommendations.push('You excel at sustained focus! Remember to take breaks to prevent burnout.');
    }

    const topPreference = analysis.preferences[0];
    if (topPreference && topPreference.preference > 80) {
      recommendations.push(`You perform exceptionally well with "${topPreference.type}" tasks. Prioritize these when possible.`);
    }

    return recommendations.slice(0, 5);
  }

  private formatHourRanges(hours: number[]): string {
    if (hours.length === 0) return '';
    
    const ranges: string[] = [];
    let rangeStart = hours[0];
    let rangeEnd = hours[0];

    for (let i = 1; i < hours.length; i++) {
      if (hours[i] === rangeEnd + 1) {
        rangeEnd = hours[i];
      } else {
        ranges.push(this.formatRange(rangeStart, rangeEnd));
        rangeStart = rangeEnd = hours[i];
      }
    }
    
    ranges.push(this.formatRange(rangeStart, rangeEnd));
    return ranges.join(', ');
  }

  private formatRange(start: number, end: number): string {
    const formatHour = (h: number) => {
      const period = h >= 12 ? 'PM' : 'AM';
      const hour = h > 12 ? h - 12 : (h === 0 ? 12 : h);
      return `${hour}${period}`;
    };

    if (start === end) {
      return formatHour(start);
    }
    return `${formatHour(start)}-${formatHour(end)}`;
  }
}
