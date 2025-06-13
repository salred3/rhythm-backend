interface Meeting {
  id: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  attendees: string[];
  location?: string;
  companyId?: string;
  projectId?: string;
  isRecurring: boolean;
  recurrenceRule?: string;
  meetingUrl?: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

export class MeetingRepository {
  private meetings: Map<string, Meeting> = new Map();

  /**
   * Create a new meeting
   */
  async create(data: Omit<Meeting, 'id'>): Promise<Meeting> {
    const meeting: Meeting = {
      ...data,
      id: `meeting-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };

    this.meetings.set(meeting.id, meeting);
    return meeting;
  }

  /**
   * Find meeting by ID
   */
  async findById(id: string): Promise<Meeting | null> {
    return this.meetings.get(id) || null;
  }

  /**
   * Update a meeting
   */
  async update(id: string, data: Partial<Meeting>): Promise<Meeting> {
    const meeting = this.meetings.get(id);
    if (!meeting) {
      throw new Error('Meeting not found');
    }

    const updated = {
      ...meeting,
      ...data,
      id,
      updatedAt: new Date(),
    };

    this.meetings.set(id, updated);
    return updated;
  }

  /**
   * Delete a meeting
   */
  async delete(id: string): Promise<void> {
    this.meetings.delete(id);
  }

  /**
   * Get meetings in a date range
   */
  async getMeetingsInRange(
    userId: string,
    startDate: Date,
    endDate: Date,
    companyId?: string
  ): Promise<Meeting[]> {
    const meetings = Array.from(this.meetings.values()).filter(meeting => {
      const isParticipant = meeting.createdBy === userId || 
                           meeting.attendees.includes(userId);
      if (!isParticipant) return false;

      const inRange = meeting.startTime <= endDate && meeting.endTime >= startDate;
      if (!inRange) return false;

      if (companyId && meeting.companyId !== companyId) return false;

      if (meeting.status === 'cancelled') return false;

      return true;
    });

    meetings.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    return meetings;
  }

  /**
   * Get meetings by attendee
   */
  async getMeetingsByAttendee(
    attendeeId: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      status?: string;
      limit?: number;
    }
  ): Promise<Meeting[]> {
    let meetings = Array.from(this.meetings.values()).filter(meeting => 
      meeting.createdBy === attendeeId || meeting.attendees.includes(attendeeId)
    );

    if (options?.startDate) {
      meetings = meetings.filter(m => m.endTime >= options.startDate!);
    }

    if (options?.endDate) {
      meetings = meetings.filter(m => m.startTime <= options.endDate!);
    }

    if (options?.status) {
      meetings = meetings.filter(m => m.status === options.status);
    }

    meetings.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    if (options?.limit) {
      meetings = meetings.slice(0, options.limit);
    }

    return meetings;
  }

  /**
   * Get recurring meeting instances
   */
  async getRecurringInstances(
    parentMeetingId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Meeting[]> {
    return [];
  }

  /**
   * Check for meeting conflicts
   */
  async checkConflicts(params: {
    attendees: string[];
    startTime: Date;
    endTime: Date;
    excludeMeetingId?: string;
  }): Promise<Meeting[]> {
    const conflicts: Meeting[] = [];

    for (const meeting of this.meetings.values()) {
      if (params.excludeMeetingId && meeting.id === params.excludeMeetingId) {
        continue;
      }

      if (meeting.status === 'cancelled') {
        continue;
      }

      const overlaps = meeting.startTime < params.endTime && 
                      meeting.endTime > params.startTime;
      if (!overlaps) continue;

      const hasAttendeeConflict = params.attendees.some(attendee =>
        meeting.createdBy === attendee || meeting.attendees.includes(attendee)
      );
      if (hasAttendeeConflict) {
        conflicts.push(meeting);
      }
    }

    return conflicts;
  }
}
