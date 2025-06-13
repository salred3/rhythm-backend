export interface AutoScheduleDto {
  startDate: Date;
  endDate: Date;
  companyIds?: string[];
  respectExistingSchedule?: boolean;
  allowCrossCompany?: boolean;
  maxHoursPerDay?: number;
  includeBreaks?: boolean;
  priorityWeight?: number;
  bufferTime?: number;
  focusBlocks?: boolean;
  minTaskDuration?: number;
  maxTaskDuration?: number;
  preferredTimeSlots?: ('morning' | 'afternoon' | 'evening')[];
  includeTaskTypes?: string[];
  excludeTaskTypes?: string[];
  includeTags?: string[];
  excludeTags?: string[];
  overdueStrategy?: 'prioritize' | 'mix' | 'ignore';
  autoApply?: boolean;
  sendNotification?: boolean;
  customRules?: {
    blackoutPeriods?: Array<{
      startTime: string;
      endTime: string;
      days?: number[];
    }>;
    projectPriorities?: Record<string, number>;
    energyLevels?: Array<{
      hour: number;
      level: number;
    }>;
  };
}

export interface AutoScheduleResponseDto {
  sessionId: string;
  status: 'queued' | 'processing' | 'preview_ready' | 'applied' | 'failed';
  jobId: string;
  estimatedCompletionTime?: Date;
  message: string;
}
