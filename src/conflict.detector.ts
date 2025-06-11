export interface ScheduleItem {
  start: Date;
  end: Date;
  description?: string;
}

export interface Conflict {
  a: ScheduleItem;
  b: ScheduleItem;
}

export class ConflictDetector {
  /**
   * Detect overlapping schedule items.
   */
  detectConflicts(items: ScheduleItem[]): Conflict[] {
    const conflicts: Conflict[] = [];
    for (let i = 0; i < items.length; i++) {
      const current = items[i];
      for (let j = i + 1; j < items.length; j++) {
        const other = items[j];
        if (current.end > other.start && current.start < other.end) {
          conflicts.push({ a: current, b: other });
        }
      }
    }
    return conflicts;
  }
}
