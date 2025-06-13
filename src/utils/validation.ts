/**
 * Simple DTO validation utility
 * In production, use class-validator or similar library
 */
export async function validateDto<T>(
  DtoClass: any,
  data: any
): Promise<T> {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid data provided');
  }
  return data as T;
}

/**
 * Validate date range
 */
export function validateDateRange(startDate: Date, endDate: Date): void {
  if (!(startDate instanceof Date) || !(endDate instanceof Date)) {
    throw new Error('Invalid date format');
  }
  if (startDate >= endDate) {
    throw new Error('End date must be after start date');
  }
  const maxRangeDays = 365;
  const rangeDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  if (rangeDays > maxRangeDays) {
    throw new Error(`Date range cannot exceed ${maxRangeDays} days`);
  }
}

/**
 * Validate time slot
 */
export function validateTimeSlot(startTime: Date, endTime: Date): void {
  if (!(startTime instanceof Date) || !(endTime instanceof Date)) {
    throw new Error('Invalid time format');
  }
  if (startTime >= endTime) {
    throw new Error('End time must be after start time');
  }
  const durationMinutes = (endTime.getTime() - startTime.getTime()) / (1000 * 60);
  if (durationMinutes < 15) {
    throw new Error('Duration must be at least 15 minutes');
  }
  if (durationMinutes > 480) {
    throw new Error('Duration cannot exceed 8 hours');
  }
}

/**
 * Validate working hours configuration
 */
export function validateWorkingHours(hours: {
  startHour: number;
  endHour: number;
}): void {
  if (hours.startHour < 0 || hours.startHour > 24) {
    throw new Error('Start hour must be between 0 and 24');
  }
  if (hours.endHour < 0 || hours.endHour > 24) {
    throw new Error('End hour must be between 0 and 24');
  }
  if (hours.startHour >= hours.endHour) {
    throw new Error('End hour must be after start hour');
  }
  const workingHours = hours.endHour - hours.startHour;
  if (workingHours > 16) {
    throw new Error('Working hours cannot exceed 16 hours per day');
  }
}

/**
 * Sanitize input to prevent XSS
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validate email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate UUID format
 */
export function validateUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}
