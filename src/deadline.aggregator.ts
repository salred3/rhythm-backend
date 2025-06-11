export interface Task {
  title: string;
  dueDate: Date;
}

export class DeadlineAggregator {
  /**
   * Return tasks with deadlines after the provided date.
   */
  getUpcomingDeadlines(tasks: Task[], from: Date = new Date()): Task[] {
    return tasks.filter(task => task.dueDate.getTime() > from.getTime());
  }
}
