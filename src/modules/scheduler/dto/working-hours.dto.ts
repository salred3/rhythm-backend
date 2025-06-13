export interface WorkingHoursDto {
  [key: string]: DayConfiguration | string;
  timezone: string;
}

export interface DayConfiguration {
  isWorkingDay: boolean;
  startHour?: number;
  endHour?: number;
  breakStart?: number;
  breakDuration?: number;
  additionalBreaks?: Array<{
    start: number;
    duration: number;
    name?: string;
  }>;
  focusHours?: Array<{
    start: number;
    end: number;
  }>;
  meetingPreferences?: {
    avoidMeetings?: boolean;
    maxMeetingHours?: number;
    preferredTimes?: Array<{
      start: number;
      end: number;
    }>;
  };
}

export interface UpdateWorkingHoursDto extends WorkingHoursDto {
  applyToFuture?: boolean;
  rescheduleConflicts?: boolean;
  effectiveDate?: Date;
}

export interface WorkingHoursTemplateDto {
  name: string;
  description?: string;
  configuration: WorkingHoursDto;
  isDefault?: boolean;
  category?: 'standard' | 'flexible' | 'compressed' | 'shift' | 'custom';
}

export interface WorkingHoursResponseDto {
  userId: string;
  configuration: {
    sunday: DayConfiguration;
    monday: DayConfiguration;
    tuesday: DayConfiguration;
    wednesday: DayConfiguration;
    thursday: DayConfiguration;
    friday: DayConfiguration;
    saturday: DayConfiguration;
    timezone: string;
  };
  weeklyHours: number;
  averageDailyHours: number;
  updatedAt: Date;
  effectiveDate?: Date;
  templateId?: string;
  templateName?: string;
}

export interface WorkingHoursStatisticsDto {
  actualVsConfigured: {
    configuredHours: number;
    actualHours: number;
    adherenceRate: number;
  };
  overtime: {
    totalHours: number;
    daysWithOvertime: number;
    averageOvertimePerDay: number;
  };
  breakUtilization: {
    configuredBreakMinutes: number;
    actualBreakMinutes: number;
    utilizationRate: number;
  };
  focusTime: {
    totalFocusHours: number;
    averageFocusBlockDuration: number;
    focusTimeByDay: Record<string, number>;
  };
  meetingDistribution: {
    meetingsInPreferredTimes: number;
    meetingsOutsidePreferredTimes: number;
    meetingsDuringFocusHours: number;
  };
  period: {
    startDate: Date;
    endDate: Date;
  };
}

export interface WorkingHoursAdjustmentDto {
  date: Date;
  type: 'holiday' | 'vacation' | 'sick_day' | 'half_day' | 'custom';
  adjustedHours?: {
    startHour: number;
    endHour: number;
    breakStart?: number;
    breakDuration?: number;
  };
  reason?: string;
  rescheduleTasks?: boolean;
}

export interface BulkWorkingHoursUpdateDto {
  userIds?: string[];
  companyId?: string;
  configuration: WorkingHoursDto;
  reason?: string;
  notifyUsers?: boolean;
  effectiveDate?: Date;
}

export const WORKING_HOURS_TEMPLATES = {
  STANDARD_9_TO_5: {
    name: 'Standard 9-5',
    description: 'Traditional Monday-Friday, 9 AM to 5 PM schedule',
    configuration: {
      0: { isWorkingDay: false },
      1: { isWorkingDay: true, startHour: 9, endHour: 17, breakStart: 12, breakDuration: 60 },
      2: { isWorkingDay: true, startHour: 9, endHour: 17, breakStart: 12, breakDuration: 60 },
      3: { isWorkingDay: true, startHour: 9, endHour: 17, breakStart: 12, breakDuration: 60 },
      4: { isWorkingDay: true, startHour: 9, endHour: 17, breakStart: 12, breakDuration: 60 },
      5: { isWorkingDay: true, startHour: 9, endHour: 17, breakStart: 12, breakDuration: 60 },
      6: { isWorkingDay: false },
      timezone: 'America/New_York',
    },
  },
  FLEXIBLE_CORE_HOURS: {
    name: 'Flexible with Core Hours',
    description: 'Flexible schedule with core hours 10 AM - 3 PM',
    configuration: {
      0: { isWorkingDay: false },
      1: { isWorkingDay: true, startHour: 7, endHour: 19, breakStart: 12, breakDuration: 60,
          focusHours: [{ start: 10, end: 15 }] },
      2: { isWorkingDay: true, startHour: 7, endHour: 19, breakStart: 12, breakDuration: 60,
          focusHours: [{ start: 10, end: 15 }] },
      3: { isWorkingDay: true, startHour: 7, endHour: 19, breakStart: 12, breakDuration: 60,
          focusHours: [{ start: 10, end: 15 }] },
      4: { isWorkingDay: true, startHour: 7, endHour: 19, breakStart: 12, breakDuration: 60,
          focusHours: [{ start: 10, end: 15 }] },
      5: { isWorkingDay: true, startHour: 7, endHour: 19, breakStart: 12, breakDuration: 60,
          focusHours: [{ start: 10, end: 15 }] },
      6: { isWorkingDay: false },
      timezone: 'America/New_York',
    },
  },
  FOUR_DAY_WEEK: {
    name: 'Four-Day Work Week',
    description: 'Monday-Thursday, 8 AM to 6 PM schedule',
    configuration: {
      0: { isWorkingDay: false },
      1: { isWorkingDay: true, startHour: 8, endHour: 18, breakStart: 12, breakDuration: 60 },
      2: { isWorkingDay: true, startHour: 8, endHour: 18, breakStart: 12, breakDuration: 60 },
      3: { isWorkingDay: true, startHour: 8, endHour: 18, breakStart: 12, breakDuration: 60 },
      4: { isWorkingDay: true, startHour: 8, endHour: 18, breakStart: 12, breakDuration: 60 },
      5: { isWorkingDay: false },
      6: { isWorkingDay: false },
      timezone: 'America/New_York',
    },
  },
};
