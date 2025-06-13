import {
  format,
  parse,
  addDays,
  subDays,
  addWeeks,
  addMonths,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  differenceInDays,
  differenceInHours,
  differenceInMinutes,
  isWeekend,
  isValid,
  isBefore,
  isAfter,
  isSameDay,
  parseISO,
  formatISO,
  getDay,
  setHours,
  setMinutes,
  addBusinessDays,
  isWithinInterval,
  eachDayOfInterval,
  formatDistance,
  formatDistanceToNow
} from 'date-fns';
import { utcToZonedTime, zonedTimeToUtc, format as formatTz } from 'date-fns-tz';

interface WorkingHours {
  start: string;
  end: string;
  timezone: string;
}

interface Holiday {
  date: Date;
  name: string;
  type: 'public' | 'company';
}

export class DateUtil {
  static readonly formats = {
    date: 'yyyy-MM-dd',
    time: 'HH:mm:ss',
    datetime: 'yyyy-MM-dd HH:mm:ss',
    display: 'MMM dd, yyyy',
    displayTime: 'h:mm a',
    displayDateTime: 'MMM dd, yyyy h:mm a',
    iso: "yyyy-MM-dd'T'HH:mm:ss.SSSxxx",
    relative: 'relative'
  };

  static toTimezone(date: Date | string, timezone: string): Date {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    return utcToZonedTime(dateObj, timezone);
  }

  static fromTimezone(date: Date | string, timezone: string): Date {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    return zonedTimeToUtc(dateObj, timezone);
  }

  static formatInTimezone(date: Date | string, timezone: string, formatStr: string = this.formats.datetime): string {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    return formatTz(dateObj, formatStr, { timeZone: timezone });
  }

  static addBusinessDays(date: Date, days: number, holidays: Holiday[] = []): Date {
    let result = date;
    let addedDays = 0;
    while (addedDays < days) {
      result = addDays(result, 1);
      if (!this.isNonWorkingDay(result, holidays)) {
        addedDays++;
      }
    }
    return result;
  }

  static subtractBusinessDays(date: Date, days: number, holidays: Holiday[] = []): Date {
    let result = date;
    let subtractedDays = 0;
    while (subtractedDays < days) {
      result = subDays(result, 1);
      if (!this.isNonWorkingDay(result, holidays)) {
        subtractedDays++;
      }
    }
    return result;
  }

  static getBusinessDaysBetween(startDate: Date, endDate: Date, holidays: Holiday[] = []): number {
    let count = 0;
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    for (const day of days) {
      if (!this.isNonWorkingDay(day, holidays)) {
        count++;
      }
    }
    return count;
  }

  static isNonWorkingDay(date: Date, holidays: Holiday[] = []): boolean {
    if (isWeekend(date)) {
      return true;
    }
    return holidays.some(holiday => isSameDay(date, holiday.date));
  }

  static isWithinWorkingHours(date: Date, workingHours: WorkingHours): boolean {
    const zonedDate = this.toTimezone(date, workingHours.timezone);
    const [startHour, startMinute] = workingHours.start.split(':').map(Number);
    const [endHour, endMinute] = workingHours.end.split(':').map(Number);
    const workStart = setMinutes(setHours(zonedDate, startHour), startMinute);
    const workEnd = setMinutes(setHours(zonedDate, endHour), endMinute);
    return isWithinInterval(zonedDate, { start: workStart, end: workEnd });
  }

  static getNextWorkingHour(date: Date, workingHours: WorkingHours, holidays: Holiday[] = []): Date {
    let current = date;
    while (true) {
      if (this.isNonWorkingDay(current, holidays)) {
        current = startOfDay(addDays(current, 1));
        continue;
      }
      if (this.isWithinWorkingHours(current, workingHours)) {
        return current;
      }
      const zonedDate = this.toTimezone(current, workingHours.timezone);
      const [startHour, startMinute] = workingHours.start.split(':').map(Number);
      const workStart = setMinutes(setHours(zonedDate, startHour), startMinute);
      if (isBefore(zonedDate, workStart)) {
        return this.fromTimezone(workStart, workingHours.timezone);
      } else {
        current = startOfDay(addDays(current, 1));
      }
    }
  }

  static addDuration(date: Date, duration: string): Date {
    const regex = /^(\d+)([dhm])$/;
    const match = duration.match(regex);
    if (!match) {
      throw new Error('Invalid duration format. Use format like "2h", "30m", "1d"');
    }
    const [, value, unit] = match;
    const amount = parseInt(value);
    switch (unit) {
      case 'd':
        return addDays(date, amount);
      case 'h':
        return new Date(date.getTime() + amount * 60 * 60 * 1000);
      case 'm':
        return new Date(date.getTime() + amount * 60 * 1000);
      default:
        throw new Error(`Invalid duration unit: ${unit}`);
    }
  }

  static formatRelative(date: Date | string): string {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    return formatDistanceToNow(dateObj, { addSuffix: true });
  }

  static formatDuration(minutes: number): string {
    if (minutes < 60) {
      return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) {
      return `${hours}h`;
    }
    return `${hours}h ${remainingMinutes}m`;
  }

  static parseDuration(duration: string): number {
    const regex = /(?:(\d+)h)?\s*(?:(\d+)m)?/;
    const match = duration.match(regex);
    if (!match) {
      throw new Error('Invalid duration format');
    }
    const hours = parseInt(match[1] || '0');
    const minutes = parseInt(match[2] || '0');
    return hours * 60 + minutes;
  }

  static getCurrentPeriod(type: 'day' | 'week' | 'month' | 'year' = 'day'): { start: Date; end: Date } {
    const now = new Date();
    switch (type) {
      case 'day':
        return { start: startOfDay(now), end: endOfDay(now) };
      case 'week':
        return { start: startOfWeek(now), end: endOfWeek(now) };
      case 'month':
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'year':
        return { start: startOfYear(now), end: endOfYear(now) };
    }
  }

  static getPreviousPeriod(type: 'day' | 'week' | 'month' | 'year' = 'day'): { start: Date; end: Date } {
    const current = this.getCurrentPeriod(type);
    switch (type) {
      case 'day':
        return { start: subDays(current.start, 1), end: subDays(current.end, 1) };
      case 'week':
        return { start: subDays(current.start, 7), end: subDays(current.end, 7) };
      case 'month':
        return { start: addMonths(current.start, -1), end: subDays(current.start, 1) };
      case 'year':
        return { start: addMonths(current.start, -12), end: subDays(current.start, 1) };
    }
  }

  static isValidDate(date: any): boolean {
    return date instanceof Date && isValid(date);
  }

  static isValidDateString(dateString: string, formatStr?: string): boolean {
    try {
      const date = formatStr ? parse(dateString, formatStr, new Date()) : parseISO(dateString);
      return isValid(date);
    } catch {
      return false;
    }
  }

  static getNextOccurrence(pattern: 'daily' | 'weekly' | 'monthly', reference: Date = new Date()): Date {
    switch (pattern) {
      case 'daily':
        return addDays(reference, 1);
      case 'weekly':
        return addWeeks(reference, 1);
      case 'monthly':
        return addMonths(reference, 1);
    }
  }

  static generateRecurringDates(
    startDate: Date,
    endDate: Date,
    pattern: 'daily' | 'weekly' | 'monthly',
    options?: { weekdays?: number[]; monthDay?: number; maxOccurrences?: number }
  ): Date[] {
    const dates: Date[] = [];
    let current = startDate;
    let count = 0;
    while (isBefore(current, endDate)) {
      if (options?.maxOccurrences && count >= options.maxOccurrences) {
        break;
      }
      if (options?.weekdays && !options.weekdays.includes(getDay(current))) {
        current = addDays(current, 1);
        continue;
      }
      if (options?.monthDay && current.getDate() !== options.monthDay) {
        current = addDays(current, 1);
        continue;
      }
      dates.push(current);
      count++;
      current = this.getNextOccurrence(pattern, current);
    }
    return dates;
  }

  static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static timeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Operation timed out')), ms))
    ]);
  }
}

