export interface CreateMeetingDto {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  attendees?: string[];
  location?: string;
  meetingUrl?: string;
  companyId?: string;
  projectId?: string;
  isRecurring?: boolean;
  recurrenceRule?: string;
  recurrenceEndDate?: Date;
  type?: 'internal' | 'external' | 'one-on-one' | 'team' | 'all-hands' | 'client' | 'interview';
  priority?: 'low' | 'medium' | 'high' | 'mandatory';
  privacy?: 'public' | 'private' | 'confidential';
  sendInvites?: boolean;
  reminders?: Array<{
    type: 'email' | 'push' | 'in-app';
    minutesBefore: number;
  }>;
  color?: string;
  notes?: string;
  preparationTasks?: string[];
  objectives?: string[];
  metadata?: Record<string, any>;
}

export interface UpdateMeetingDto {
  title?: string;
  description?: string;
  startTime?: Date;
  endTime?: Date;
  attendees?: string[];
  location?: string;
  meetingUrl?: string;
  status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  type?: 'internal' | 'external' | 'one-on-one' | 'team' | 'all-hands' | 'client' | 'interview';
  priority?: 'low' | 'medium' | 'high' | 'mandatory';
  privacy?: 'public' | 'private' | 'confidential';
  recurrenceRule?: string;
  recurrenceEndDate?: Date;
  updateScope?: 'this' | 'future' | 'all';
  notifyAttendees?: boolean;
  updateReason?: string;
  notes?: string;
  color?: string;
  metadata?: Record<string, any>;
}

export interface MeetingFilterDto {
  startDate?: Date;
  endDate?: Date;
  companyId?: string;
  projectId?: string;
  type?: 'internal' | 'external' | 'one-on-one' | 'team' | 'all-hands' | 'client' | 'interview';
  status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  attendeeId?: string;
  includeRecurring?: boolean;
  search?: string;
  sortBy?: 'startTime' | 'title' | 'priority' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface MeetingResponseDto {
  id: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  attendees: Array<{
    userId: string;
    email?: string;
    name?: string;
    status: 'accepted' | 'declined' | 'tentative' | 'pending';
    isOrganizer: boolean;
  }>;
  location?: string;
  meetingUrl?: string;
  companyId?: string;
  companyName?: string;
  projectId?: string;
  projectName?: string;
  isRecurring: boolean;
  recurrenceRule?: string;
  recurrenceEndDate?: Date;
  recurringMeetingId?: string;
  type: string;
  priority: string;
  privacy: string;
  status: string;
  notes?: string;
  preparationTasks?: string[];
  objectives?: string[];
  color?: string;
  createdBy: string;
  createdByName?: string;
  createdAt: Date;
  updatedAt: Date;
  reminders?: Array<{
    type: string;
    minutesBefore: number;
  }>;
  metadata?: Record<string, any>;
}

export interface MeetingConflictDto {
  conflictingMeetings: Array<{
    id: string;
    title: string;
    startTime: Date;
    endTime: Date;
    attendees: string[];
  }>;
  suggestions: Array<{
    startTime: Date;
    endTime: Date;
    availability: number;
  }>;
  message: string;
}

export interface BulkMeetingActionDto {
  meetingIds: string[];
  action: 'cancel' | 'reschedule' | 'update_attendees' | 'change_status';
  data?: {
    newStartTime?: Date;
    timeShiftMinutes?: number;
    addAttendees?: string[];
    removeAttendees?: string[];
    newStatus?: 'scheduled' | 'cancelled' | 'completed';
    reason?: string;
    notifyAttendees?: boolean;
  };
}

export interface MeetingStatisticsDto {
  totalMeetings: number;
  totalHours: number;
  averageDuration: number;
  meetingsByType: Record<string, number>;
  meetingsByDay: Record<string, number>;
  mostFrequentAttendees: Array<{
    userId: string;
    name: string;
    meetingCount: number;
  }>;
  peakMeetingHours: Array<{
    hour: number;
    count: number;
  }>;
  cancellationRate: number;
  averageAttendees: number;
}
