interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  data?: any;
  read: boolean;
  createdAt: Date;
}

export class NotificationService {
  private notifications: Map<string, Notification> = new Map();

  /**
   * Send a notification to a user
   */
  private async sendNotification(params: {
    userId: string;
    type: string;
    title: string;
    message: string;
    data?: any;
  }): Promise<void> {
    const notification: Notification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      data: params.data,
      read: false,
      createdAt: new Date(),
    };

    this.notifications.set(notification.id, notification);

    // In production, would also:
    // - Send push notification
    // - Send email if configured
    // - Emit WebSocket event
    console.log('Notification sent:', notification);
  }

  /**
   * Notify when scheduling is complete
   */
  async notifySchedulingComplete(userId: string, data: {
    sessionId: string;
    tasksScheduled: number;
    conflicts: number;
    autoApplied: boolean;
  }): Promise<void> {
    await this.sendNotification({
      userId,
      type: 'scheduling_complete',
      title: 'Scheduling Complete',
      message: `Successfully scheduled ${data.tasksScheduled} tasks${
        data.conflicts > 0 ? ` with ${data.conflicts} conflicts requiring attention` : ''
      }. ${data.autoApplied ? 'Changes have been applied.' : 'Review and apply changes.'}`,
      data,
    });
  }

  /**
   * Notify when scheduling fails
   */
  async notifySchedulingFailed(userId: string, data: {
    sessionId: string;
    error: string;
  }): Promise<void> {
    await this.sendNotification({
      userId,
      type: 'scheduling_failed',
      title: 'Scheduling Failed',
      message: `Unable to complete scheduling: ${data.error}`,
      data,
    });
  }

  /**
   * Notify when schedule is applied
   */
  async notifyScheduleApplied(userId: string, data: {
    tasksScheduled: number;
    totalHours: number;
    sessionId: string;
  }): Promise<void> {
    await this.sendNotification({
      userId,
      type: 'schedule_applied',
      title: 'Schedule Applied',
      message: `${data.tasksScheduled} tasks (${data.totalHours.toFixed(1)} hours) have been scheduled`,
      data,
    });
  }

  /**
   * Notify when schedule is rolled back
   */
  async notifyScheduleRolledBack(userId: string, sessionId: string): Promise<void> {
    await this.sendNotification({
      userId,
      type: 'schedule_rolled_back',
      title: 'Schedule Rolled Back',
      message: 'Your schedule has been restored to its previous state',
      data: { sessionId },
    });
  }

  /**
   * Notify when scheduling is cancelled
   */
  async notifySchedulingCancelled(userId: string, data: {
    sessionId: string;
  }): Promise<void> {
    await this.sendNotification({
      userId,
      type: 'scheduling_cancelled',
      title: 'Scheduling Cancelled',
      message: 'The scheduling operation has been cancelled',
      data,
    });
  }

  /**
   * Send real-time update
   */
  async sendRealtimeUpdate(userId: string, update: any): Promise<void> {
    // In production, emit via WebSocket
    console.log('Realtime update for user', userId, ':', update);
  }

  /**
   * Send meeting invitation
   */
  async sendMeetingInvitation(params: {
    meetingId: string;
    organizerId: string;
    attendeeId: string;
    meetingTitle: string;
    startTime: Date;
    endTime: Date;
    location?: string;
    meetingUrl?: string;
  }): Promise<void> {
    await this.sendNotification({
      userId: params.attendeeId,
      type: 'meeting_invitation',
      title: 'Meeting Invitation',
      message: `You've been invited to "${params.meetingTitle}"`,
      data: params,
    });
  }

  /**
   * Send meeting update notification
   */
  async sendMeetingUpdate(params: {
    meetingId: string;
    attendeeIds: string[];
    changes: string[];
    meetingTitle: string;
  }): Promise<void> {
    for (const attendeeId of params.attendeeIds) {
      await this.sendNotification({
        userId: attendeeId,
        type: 'meeting_updated',
        title: 'Meeting Updated',
        message: `"${params.meetingTitle}" has been updated: ${params.changes.join(', ')}`,
        data: params,
      });
    }
  }

  /**
   * Send meeting cancellation
   */
  async sendMeetingCancellation(params: {
    meetingId: string;
    attendeeIds: string[];
    meetingTitle: string;
    reason?: string;
  }): Promise<void> {
    for (const attendeeId of params.attendeeIds) {
      await this.sendNotification({
        userId: attendeeId,
        type: 'meeting_cancelled',
        title: 'Meeting Cancelled',
        message: `"${params.meetingTitle}" has been cancelled${
          params.reason ? `: ${params.reason}` : ''
        }`,
        data: params,
      });
    }
  }

  /**
   * Send meeting reminder
   */
  async sendMeetingReminder(params: {
    userId: string;
    meetingId: string;
    meetingTitle: string;
    startTime: Date;
    minutesUntilStart: number;
  }): Promise<void> {
    await this.sendNotification({
      userId: params.userId,
      type: 'meeting_reminder',
      title: 'Meeting Reminder',
      message: `"${params.meetingTitle}" starts in ${params.minutesUntilStart} minutes`,
      data: params,
    });
  }

  /**
   * Get user notifications
   */
  async getUserNotifications(
    userId: string,
    options?: {
      unreadOnly?: boolean;
      limit?: number;
      types?: string[];
    }
  ): Promise<Notification[]> {
    let notifications = Array.from(this.notifications.values()).filter(
      n => n.userId === userId
    );

    if (options?.unreadOnly) {
      notifications = notifications.filter(n => !n.read);
    }

    if (options?.types && options.types.length > 0) {
      notifications = notifications.filter(n => options.types!.includes(n.type));
    }

    // Sort by date, newest first
    notifications.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (options?.limit) {
      notifications = notifications.slice(0, options.limit);
    }

    return notifications;
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<void> {
    const notification = this.notifications.get(notificationId);
    if (notification) {
      notification.read = true;
      this.notifications.set(notificationId, notification);
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<void> {
    for (const [id, notification] of this.notifications) {
      if (notification.userId === userId) {
        notification.read = true;
        this.notifications.set(id, notification);
      }
    }
  }

  /**
   * Delete notification
   */
  async deleteNotification(notificationId: string): Promise<void> {
    this.notifications.delete(notificationId);
  }

  /**
   * Get unread count
   */
  async getUnreadCount(userId: string): Promise<number> {
    return Array.from(this.notifications.values()).filter(
      n => n.userId === userId && !n.read
    ).length;
  }
}
