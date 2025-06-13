interface Task {
  id: string;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  effort: number;
  impact: number;
  status: string;
  companyId: string;
  projectId?: string;
  assignedTo?: string;
  createdBy: string;
  dueDate?: Date;
  scheduledStart?: Date;
  scheduledEnd?: Date;
  timeSpent: number;
  estimatedDuration?: number;
  tags?: string[];
  dependencies?: string[];
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  lastScheduledBy?: string;
}

export class TaskRepository {
  private tasks: Map<string, Task> = new Map();

  /**
   * Get tasks for scheduling
   */
  async getTasksForScheduling(
    userId: string,
    companyIds?: string[]
  ): Promise<Task[]> {
    const tasks = Array.from(this.tasks.values()).filter(task => {
      // Filter by user
      if (task.assignedTo !== userId && task.createdBy !== userId) {
        return false;
      }

      // Filter by company
      if (companyIds && companyIds.length > 0 && !companyIds.includes(task.companyId)) {
        return false;
      }

      // Only get incomplete tasks
      if (task.status === 'done' || task.status === 'cancelled') {
        return false;
      }

      return true;
    });

    // Sort by priority and due date
    tasks.sort((a, b) => {
      // Priority order
      const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 } as any;
      const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];

      if (priorityDiff !== 0) return priorityDiff;

      // Then by due date (earlier first)
      if (a.dueDate && b.dueDate) {
        return a.dueDate.getTime() - b.dueDate.getTime();
      }

      // Tasks with due dates come first
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;

      // Finally by effort/impact ratio
      const aRatio = a.impact / a.effort;
      const bRatio = b.impact / b.effort;

      return bRatio - aRatio;
    });

    return tasks;
  }

  /**
   * Get scheduled tasks in a date range
   */
  async getScheduledTasksInRange(
    userId: string,
    startDate: Date,
    endDate: Date,
    companyId?: string
  ): Promise<Task[]> {
    const tasks = Array.from(this.tasks.values()).filter(task => {
      // Filter by user
      if (task.assignedTo !== userId && task.createdBy !== userId) {
        return false;
      }

      // Filter by company
      if (companyId && task.companyId !== companyId) {
        return false;
      }

      // Check if scheduled
      if (!task.scheduledStart || !task.scheduledEnd) {
        return false;
      }

      // Check date range
      const inRange = task.scheduledStart <= endDate && task.scheduledEnd >= startDate;

      return inRange;
    });

    // Sort by scheduled start time
    tasks.sort((a, b) => {
      if (!a.scheduledStart || !b.scheduledStart) return 0;
      return a.scheduledStart.getTime() - b.scheduledStart.getTime();
    });

    return tasks;
  }

  /**
   * Update task schedule
   */
  async updateTaskSchedule(
    taskId: string,
    schedule: {
      scheduledStart?: Date;
      scheduledEnd?: Date;
      lastScheduledBy?: string;
    }
  ): Promise<Task> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    const updated = {
      ...task,
      ...schedule,
      updatedAt: new Date(),
    };

    this.tasks.set(taskId, updated);
    return updated;
  }

  /**
   * Get task by ID
   */
  async findById(id: string): Promise<Task | null> {
    return this.tasks.get(id) || null;
  }

  /**
   * Get tasks by project
   */
  async getTasksByProject(projectId: string): Promise<Task[]> {
    return Array.from(this.tasks.values()).filter(
      task => task.projectId === projectId
    );
  }

  /**
   * Get overdue tasks
   */
  async getOverdueTasks(userId: string): Promise<Task[]> {
    const now = new Date();

    return Array.from(this.tasks.values()).filter(task => {
      if (task.assignedTo !== userId && task.createdBy !== userId) {
        return false;
      }

      if (task.status === 'done' || task.status === 'cancelled') {
        return false;
      }

      return task.dueDate && task.dueDate < now;
    });
  }

  /**
   * Get task statistics
   */
  async getTaskStats(params: {
    userId?: string;
    companyId?: string;
    projectId?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<{
    total: number;
    completed: number;
    inProgress: number;
    notStarted: number;
    overdue: number;
    averageCompletionTime: number;
    byPriority: Record<string, number>;
  }> {
    let tasks = Array.from(this.tasks.values());

    // Apply filters
    if (params.userId) {
      tasks = tasks.filter(t =>
        t.assignedTo === params.userId || t.createdBy === params.userId
      );
    }

    if (params.companyId) {
      tasks = tasks.filter(t => t.companyId === params.companyId);
    }

    if (params.projectId) {
      tasks = tasks.filter(t => t.projectId === params.projectId);
    }

    if (params.startDate) {
      tasks = tasks.filter(t => t.createdAt >= params.startDate!);
    }

    if (params.endDate) {
      tasks = tasks.filter(t => t.createdAt <= params.endDate!);
    }

    // Calculate stats
    const stats = {
      total: tasks.length,
      completed: 0,
      inProgress: 0,
      notStarted: 0,
      overdue: 0,
      averageCompletionTime: 0,
      byPriority: {} as Record<string, number>,
    };

    const now = new Date();
    let totalCompletionTime = 0;
    let completedCount = 0;

    for (const task of tasks) {
      // Status counts
      if (task.status === 'done') {
        stats.completed++;

        if (task.completedAt && task.createdAt) {
          totalCompletionTime += task.completedAt.getTime() - task.createdAt.getTime();
          completedCount++;
        }
      } else if (task.status === 'in_progress') {
        stats.inProgress++;
      } else if (task.status === 'todo' || task.status === 'backlog') {
        stats.notStarted++;
      }

      // Overdue count
      if (task.dueDate && task.dueDate < now && task.status !== 'done') {
        stats.overdue++;
      }

      // Priority counts
      stats.byPriority[task.priority] = (stats.byPriority[task.priority] || 0) + 1;
    }

    // Average completion time in hours
    if (completedCount > 0) {
      stats.averageCompletionTime = totalCompletionTime / completedCount / (1000 * 60 * 60);
    }

    return stats;
  }

  /**
   * Bulk update tasks
   */
  async bulkUpdate(
    taskIds: string[],
    updates: Partial<Task>
  ): Promise<Task[]> {
    const updatedTasks: Task[] = [];

    for (const taskId of taskIds) {
      const task = this.tasks.get(taskId);
      if (task) {
        const updated = {
          ...task,
          ...updates,
          id: task.id, // Preserve ID
          updatedAt: new Date(),
        };
        this.tasks.set(taskId, updated);
        updatedTasks.push(updated);
      }
    }

    return updatedTasks;
  }
}
