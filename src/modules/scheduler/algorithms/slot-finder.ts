interface WorkingHours {
  [day: number]: {
    isWorkingDay: boolean;
    startHour: number;
    endHour: number;
    breakStart?: number;
    breakDuration?: number;
  };
}

interface Meeting {
  id: string;
  startTime: Date;
  endTime: Date;
  title: string;
  isRecurring?: boolean;
  recurrenceRule?: string;
}

interface TimeSlot {
  start: Date;
  end: Date;
  duration: number;
  quality: number;
}

interface BlockedTime {
  start: Date;
  end: Date;
  reason: 'meeting' | 'break' | 'outside_hours' | 'buffer';
}

export class SlotFinder {
  async findAvailableSlots(params: {
    startDate: Date;
    endDate: Date;
    workingHours: WorkingHours;
    existingMeetings: Meeting[];
    bufferTime: number;
    includeBreaks: boolean;
  }): Promise<TimeSlot[]> {
    const { startDate, endDate, workingHours, existingMeetings, bufferTime, includeBreaks } = params;
    const workingSlots = this.generateWorkingSlots(startDate, endDate, workingHours);
    const blockedTimes = this.getBlockedTimes({
      meetings: existingMeetings,
      workingHours,
      includeBreaks,
      bufferTime,
      startDate,
      endDate,
    });
    const availableSlots = this.subtractBlockedTimes(workingSlots, blockedTimes);
    const scoredSlots = this.scoreSlots(availableSlots, workingHours);
    const usableSlots = scoredSlots.filter(slot => slot.duration >= 30);
    return usableSlots;
  }

  private generateWorkingSlots(startDate: Date, endDate: Date, workingHours: WorkingHours): TimeSlot[] {
    const slots: TimeSlot[] = [];
    const current = new Date(startDate);
    current.setHours(0, 0, 0, 0);
    while (current <= endDate) {
      const dayOfWeek = current.getDay();
      const dayConfig = workingHours[dayOfWeek];
      if (dayConfig && dayConfig.isWorkingDay) {
        const dayStart = new Date(current);
        dayStart.setHours(Math.floor(dayConfig.startHour), (dayConfig.startHour % 1) * 60, 0, 0);
        const dayEnd = new Date(current);
        dayEnd.setHours(Math.floor(dayConfig.endHour), (dayConfig.endHour % 1) * 60, 0, 0);
        if (dayEnd >= startDate && dayStart <= endDate) {
          slots.push({
            start: dayStart < startDate ? startDate : dayStart,
            end: dayEnd > endDate ? endDate : dayEnd,
            duration: (dayEnd.getTime() - dayStart.getTime()) / (1000 * 60),
            quality: 1,
          });
        }
      }
      current.setDate(current.getDate() + 1);
    }
    return slots;
  }

  private getBlockedTimes(params: {
    meetings: Meeting[];
    workingHours: WorkingHours;
    includeBreaks: boolean;
    bufferTime: number;
    startDate: Date;
    endDate: Date;
  }): BlockedTime[] {
    const blocked: BlockedTime[] = [];
    const { meetings, workingHours, includeBreaks, bufferTime, startDate, endDate } = params;
    for (const meeting of meetings) {
      const occurrences = this.getRecurringMeetingOccurrences(meeting, startDate, endDate);
      for (const occurrence of occurrences) {
        if (bufferTime > 0) {
          blocked.push({ start: new Date(occurrence.startTime.getTime() - bufferTime * 60 * 1000), end: occurrence.startTime, reason: 'buffer' });
        }
        blocked.push({ start: occurrence.startTime, end: occurrence.endTime, reason: 'meeting' });
        if (bufferTime > 0) {
          blocked.push({ start: occurrence.endTime, end: new Date(occurrence.endTime.getTime() + bufferTime * 60 * 1000), reason: 'buffer' });
        }
      }
    }
    if (includeBreaks) {
      const current = new Date(startDate);
      current.setHours(0, 0, 0, 0);
      while (current <= endDate) {
        const dayOfWeek = current.getDay();
        const dayConfig = workingHours[dayOfWeek];
        if (dayConfig?.isWorkingDay && dayConfig.breakStart && dayConfig.breakDuration) {
          const breakStart = new Date(current);
          breakStart.setHours(Math.floor(dayConfig.breakStart), (dayConfig.breakStart % 1) * 60, 0, 0);
          const breakEnd = new Date(breakStart.getTime() + dayConfig.breakDuration * 60 * 1000);
          blocked.push({ start: breakStart, end: breakEnd, reason: 'break' });
        }
        current.setDate(current.getDate() + 1);
      }
    }
    return blocked;
  }

  private getRecurringMeetingOccurrences(meeting: Meeting, startDate: Date, endDate: Date): Meeting[] {
    if (!meeting.isRecurring || !meeting.recurrenceRule) {
      return [meeting];
    }
    const occurrences: Meeting[] = [];
    const dayOfWeek = meeting.startTime.getDay();
    const current = new Date(startDate);
    while (current <= endDate) {
      if (current.getDay() === dayOfWeek) {
        const occurrenceStart = new Date(current);
        occurrenceStart.setHours(meeting.startTime.getHours(), meeting.startTime.getMinutes(), 0, 0);
        const occurrenceEnd = new Date(current);
        occurrenceEnd.setHours(meeting.endTime.getHours(), meeting.endTime.getMinutes(), 0, 0);
        if (occurrenceStart >= startDate && occurrenceEnd <= endDate) {
          occurrences.push({ ...meeting, startTime: occurrenceStart, endTime: occurrenceEnd });
        }
      }
      current.setDate(current.getDate() + 1);
    }
    return occurrences;
  }

  private subtractBlockedTimes(slots: TimeSlot[], blockedTimes: BlockedTime[]): TimeSlot[] {
    const availableSlots: TimeSlot[] = [];
    for (const slot of slots) {
      const remainingParts = this.subtractBlockedFromSlot(slot, blockedTimes);
      availableSlots.push(...remainingParts);
    }
    return availableSlots;
  }

  private subtractBlockedFromSlot(slot: TimeSlot, blockedTimes: BlockedTime[]): TimeSlot[] {
    const relevantBlocked = blockedTimes
      .filter(b => b.start < slot.end && b.end > slot.start)
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    if (relevantBlocked.length === 0) {
      return [slot];
    }
    const fragments: TimeSlot[] = [];
    let currentStart = slot.start;
    for (const blocked of relevantBlocked) {
      if (currentStart < blocked.start) {
        fragments.push({
          start: currentStart,
          end: blocked.start,
          duration: (blocked.start.getTime() - currentStart.getTime()) / (1000 * 60),
          quality: slot.quality,
        });
      }
      currentStart = blocked.end > currentStart ? blocked.end : currentStart;
    }
    if (currentStart < slot.end) {
      fragments.push({
        start: currentStart,
        end: slot.end,
        duration: (slot.end.getTime() - currentStart.getTime()) / (1000 * 60),
        quality: slot.quality,
      });
    }
    return fragments;
  }

  private scoreSlots(slots: TimeSlot[], workingHours: WorkingHours): TimeSlot[] {
    return slots.map(slot => {
      const hour = slot.start.getHours() + slot.start.getMinutes() / 60;
      const dayOfWeek = slot.start.getDay();
      const dayConfig = workingHours[dayOfWeek];
      if (!dayConfig) {
        return { ...slot, quality: 0.5 };
      }
      let quality = 1;
      if (hour >= 9 && hour <= 11) {
        quality = 1;
      } else if (hour >= 13 && hour <= 16) {
        quality = 0.9;
      } else if (hour >= 8 && hour < 9) {
        quality = 0.8;
      } else if (hour >= 16 && hour <= 18) {
        quality = 0.7;
      } else {
        quality = 0.5;
      }
      if (dayOfWeek === 1 && hour < 10) {
        quality *= 0.9;
      } else if (dayOfWeek === 5 && hour > 15) {
        quality *= 0.85;
      }
      if (dayOfWeek >= 2 && dayOfWeek <= 4) {
        quality *= 1.05;
      }
      quality = Math.max(0, Math.min(1, quality));
      return { ...slot, quality };
    });
  }
}
