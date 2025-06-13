import { CompanyMember, Project, Task } from '@prisma/client';

interface CompanyData {
  members: CompanyMember[];
  projects: Project[];
  tasks: Task[];
}

interface CompanyAnalytics {
  teamVelocity: {
    current: number;
    trend: 'increasing' | 'stable' | 'decreasing';
    byTeamMember: Array<{ memberId: string; velocity: number }>;
  };
  projectProgress: Array<{
    projectId: string;
    name: string;
    completion: number;
    onTrack: boolean;
    estimatedCompletionDate: Date;
  }>;
  resourceUtilization: {
    overall: number;
    byMember: Array<{ memberId: string; name: string; utilization: number; capacity: number }>;
  };
  deadlinePerformance: {
    onTimeDelivery: number;
    averageDelay: number;
    upcomingRisks: Array<{ taskId: string; title: string; dueDate: Date; riskLevel: 'low' | 'medium' | 'high' }>;
  };
  healthMetrics: {
    score: number;
    factors: { velocity: number; utilization: number; deadlines: number; collaboration: number };
    recommendations: string[];
  };
}

export class CompanyAnalyzer {
  async analyze(data: CompanyData): Promise<CompanyAnalytics> {
    const velocity = this.calculateTeamVelocity(data);
    const progress = this.calculateProjectProgress(data);
    const utilization = this.calculateResourceUtilization(data);
    const deadlines = this.analyzeDeadlinePerformance(data);
    const health = this.calculateHealthMetrics(velocity, utilization, deadlines, data);

    return {
      teamVelocity: velocity,
      projectProgress: progress,
      resourceUtilization: utilization,
      deadlinePerformance: deadlines,
      healthMetrics: health
    };
  }

  private calculateTeamVelocity(data: CompanyData): {
    current: number;
    trend: 'increasing' | 'stable' | 'decreasing';
    byTeamMember: Array<{ memberId: string; velocity: number }>;
  } {
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

    const completedTasks = data.tasks.filter(task => 
      task.status === 'completed' && 
      task.completedAt && 
      new Date(task.completedAt) >= fourWeeksAgo
    );

    const totalPoints = completedTasks.reduce((sum, task) => sum + (task.effort || 1), 0);
    const currentVelocity = totalPoints / 4;

    const eightWeeksAgo = new Date();
    eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);
    
    const previousTasks = data.tasks.filter(task =>
      task.status === 'completed' &&
      task.completedAt &&
      new Date(task.completedAt) >= eightWeeksAgo &&
      new Date(task.completedAt) < fourWeeksAgo
    );

    const previousPoints = previousTasks.reduce((sum, task) => sum + (task.effort || 1), 0);
    const previousVelocity = previousPoints / 4;

    let trend: 'increasing' | 'stable' | 'decreasing';
    if (currentVelocity > previousVelocity * 1.1) trend = 'increasing';
    else if (currentVelocity < previousVelocity * 0.9) trend = 'decreasing';
    else trend = 'stable';

    const memberVelocity = new Map<string, number>();
    
    completedTasks.forEach(task => {
      if (task.assigneeId) {
        const current = memberVelocity.get(task.assigneeId) || 0;
        memberVelocity.set(task.assigneeId, current + (task.effort || 1));
      }
    });

    const byTeamMember = Array.from(memberVelocity.entries())
      .map(([memberId, points]) => ({
        memberId,
        velocity: points / 4
      }))
      .sort((a, b) => b.velocity - a.velocity);

    return {
      current: Math.round(currentVelocity * 10) / 10,
      trend,
      byTeamMember
    };
  }

  private calculateProjectProgress(data: CompanyData): Array<{
    projectId: string;
    name: string;
    completion: number;
    onTrack: boolean;
    estimatedCompletionDate: Date;
  }> {
    return data.projects.map(project => {
      const projectTasks = data.tasks.filter(task => task.projectId === project.id);
      
      if (projectTasks.length === 0) {
        return {
          projectId: project.id,
          name: project.name,
          completion: 0,
          onTrack: true,
          estimatedCompletionDate: project.endDate || new Date()
        };
      }

      const completedTasks = projectTasks.filter(task => task.status === 'completed');
      const completion = (completedTasks.length / projectTasks.length) * 100;

      const now = new Date();
      const projectStart = project.startDate || new Date(project.createdAt);
      const projectEnd = project.endDate || new Date();
      
      const totalDuration = projectEnd.getTime() - projectStart.getTime();
      const elapsed = now.getTime() - projectStart.getTime();
      const expectedCompletion = (elapsed / totalDuration) * 100;

      const onTrack = completion >= expectedCompletion - 10;

      const remainingTasks = projectTasks.length - completedTasks.length;
      const recentVelocity = this.calculateRecentVelocity(projectTasks);
      
      const weeksToComplete = recentVelocity > 0 ? remainingTasks / recentVelocity : 0;
      const estimatedCompletionDate = new Date();
      estimatedCompletionDate.setDate(estimatedCompletionDate.getDate() + (weeksToComplete * 7));

      return {
        projectId: project.id,
        name: project.name,
        completion: Math.round(completion),
        onTrack,
        estimatedCompletionDate
      };
    });
  }

  private calculateResourceUtilization(data: CompanyData): {
    overall: number;
    byMember: Array<{ memberId: string; name: string; utilization: number; capacity: number }>;
  } {
    const memberUtilization = data.members.map(member => {
      const activeTasks = data.tasks.filter(task => 
        task.assigneeId === member.userId &&
        task.status !== 'completed' &&
        task.status !== 'cancelled'
      );

      const totalEffort = activeTasks.reduce((sum, task) => sum + (task.effort || 1), 0);
      
      const weeklyCapacity = 40;
      const utilization = (totalEffort / weeklyCapacity) * 100;

      return {
        memberId: member.userId,
        name: member.userId,
        utilization: Math.min(150, Math.round(utilization)),
        capacity: weeklyCapacity
      };
    });

    const overallUtilization = memberUtilization.length > 0
      ? memberUtilization.reduce((sum, m) => sum + m.utilization, 0) / memberUtilization.length
      : 0;

    return {
      overall: Math.round(overallUtilization),
      byMember: memberUtilization.sort((a, b) => b.utilization - a.utilization)
    };
  }

  private analyzeDeadlinePerformance(data: CompanyData): {
    onTimeDelivery: number;
    averageDelay: number;
    upcomingRisks: Array<{ taskId: string; title: string; dueDate: Date; riskLevel: 'low' | 'medium' | 'high' }>;
  } {
    const completedWithDueDates = data.tasks.filter(task =>
      task.status === 'completed' &&
      task.dueDate &&
      task.completedAt
    );

    let onTimeCount = 0;
    let totalDelay = 0;

    completedWithDueDates.forEach(task => {
      const dueDate = new Date(task.dueDate!);
      const completedDate = new Date(task.completedAt!);
      
      if (completedDate <= dueDate) {
        onTimeCount++;
      } else {
        const delayDays = Math.ceil((completedDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        totalDelay += delayDays;
      }
    });

    const onTimeDelivery = completedWithDueDates.length > 0
      ? (onTimeCount / completedWithDueDates.length) * 100
      : 100;

    const delayedTasks = completedWithDueDates.length - onTimeCount;
    const averageDelay = delayedTasks > 0 ? totalDelay / delayedTasks : 0;

    const upcomingTasks = data.tasks.filter(task =>
      task.status !== 'completed' &&
      task.status !== 'cancelled' &&
      task.dueDate
    );

    const now = new Date();
    const upcomingRisks = upcomingTasks
      .map(task => {
        const dueDate = new Date(task.dueDate!);
        const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        let riskLevel: 'low' | 'medium' | 'high';
        if (daysUntilDue < 0) riskLevel = 'high';
        else if (daysUntilDue <= 3) riskLevel = 'high';
        else if (daysUntilDue <= 7) riskLevel = 'medium';
        else riskLevel = 'low';

        if (task.effort && task.effort > 5 && daysUntilDue <= 7) {
          riskLevel = 'high';
        }

        return {
          taskId: task.id,
          title: task.title,
          dueDate,
          riskLevel
        };
      })
      .filter(risk => risk.riskLevel !== 'low')
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

    return {
      onTimeDelivery: Math.round(onTimeDelivery),
      averageDelay: Math.round(averageDelay * 10) / 10,
      upcomingRisks: upcomingRisks.slice(0, 10)
    };
  }

  private calculateHealthMetrics(
    velocity: any,
    utilization: any,
    deadlines: any,
    data: CompanyData
  ): {
    score: number;
    factors: { velocity: number; utilization: number; deadlines: number; collaboration: number };
    recommendations: string[];
  } {
    let velocityScore = 50;
    if (velocity.trend === 'increasing') velocityScore = 80;
    else if (velocity.trend === 'decreasing') velocityScore = 20;
    
    let utilizationScore = 100;
    if (utilization.overall < 50) utilizationScore = 50;
    else if (utilization.overall > 100) utilizationScore = 100 - (utilization.overall - 100);
    
    const deadlineScore = deadlines.onTimeDelivery;
    const collaborationScore = this.calculateCollaborationScore(data);

    const score = Math.round(
      (velocityScore * 0.25) +
      (utilizationScore * 0.25) +
      (deadlineScore * 0.3) +
      (collaborationScore * 0.2)
    );

    const recommendations: string[] = [];

    if (velocityScore < 50) {
      recommendations.push('Team velocity is declining. Review blockers and process efficiency.');
    }

    if (utilizationScore < 70) {
      if (utilization.overall < 50) {
        recommendations.push('Team is under-utilized. Consider taking on additional projects.');
      } else {
        recommendations.push('Team is over-utilized. Consider redistributing work or hiring.');
      }
    }

    if (deadlineScore < 80) {
      recommendations.push(`Only ${deadlineScore}% on-time delivery. Review estimation practices.`);
    }

    if (collaborationScore < 60) {
      recommendations.push('Low collaboration detected. Encourage more team interaction.');
    }

    if (deadlines.upcomingRisks.filter(r => r.riskLevel === 'high').length > 3) {
      recommendations.push('Multiple high-risk deadlines approaching. Prioritize critical tasks.');
    }

    return {
      score,
      factors: {
        velocity: velocityScore,
        utilization: utilizationScore,
        deadlines: deadlineScore,
        collaboration: collaborationScore
      },
      recommendations: recommendations.slice(0, 5)
    };
  }

  private calculateRecentVelocity(tasks: Task[]): number {
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const recentCompleted = tasks.filter(task =>
      task.status === 'completed' &&
      task.completedAt &&
      new Date(task.completedAt) >= twoWeeksAgo
    );

    return recentCompleted.length / 2;
  }

  private calculateCollaborationScore(data: CompanyData): number {
    const tasksWithMultipleContributors = data.tasks.filter(task => {
      return task.assigneeId && task.reviewerId && task.assigneeId !== task.reviewerId;
    });

    const collaborationRate = data.tasks.length > 0
      ? (tasksWithMultipleContributors.length / data.tasks.length) * 100
      : 0;

    return Math.round(collaborationRate);
  }
}
