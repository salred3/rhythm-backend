import { DatabaseService } from '../database/database.service';
import { EventEmitter } from 'events';

export interface ActivityLog {
  id: string;
  companyId?: string;
  userId: string;
  userEmail?: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: any;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

export interface ActivityFilters {
  companyId?: string;
  userId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  type?: string;
}

export class ActivityLogger {
  private db: DatabaseService;
  private tableName = 'activity_logs';
  private eventEmitter: EventEmitter;

  constructor() {
    this.db = DatabaseService.getInstance();
    this.eventEmitter = new EventEmitter();
  }

  /**
   * Log an activity
   */
  async log(activity: Omit<ActivityLog, 'id' | 'createdAt'>): Promise<void> {
    try {
      const query = `
        INSERT INTO ${this.tableName} (
          id, company_id, user_id, user_email, action, 
          entity_type, entity_id, metadata, ip_address, 
          user_agent, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `;

      const values = [
        this.generateId(),
        activity.companyId || null,
        activity.userId,
        activity.userEmail || null,
        activity.action,
        activity.entityType,
        activity.entityId || null,
        JSON.stringify(activity.metadata || {}),
        activity.ipAddress || null,
        activity.userAgent || null,
        new Date()
      ];

      await this.db.query(query, values);

      // Emit event for real-time processing
      this.eventEmitter.emit('activity:logged', activity);
    } catch (error) {
      // Log errors but don't throw - activity logging shouldn't break the main flow
      console.error('Failed to log activity:', error);
    }
  }

  /**
   * Get activities for a company
   */
  async getCompanyActivities(
    companyId: string, 
    filters: ActivityFilters = {}
  ): Promise<ActivityLog[]> {
    const conditions = ['company_id = $1'];
    const values: any[] = [companyId];
    let paramCount = 2;

    if (filters.userId) {
      conditions.push(`user_id = $${paramCount}`);
      values.push(filters.userId);
      paramCount++;
    }

    if (filters.action) {
      conditions.push(`action = $${paramCount}`);
      values.push(filters.action);
      paramCount++;
    }

    if (filters.entityType) {
      conditions.push(`entity_type = $${paramCount}`);
      values.push(filters.entityType);
      paramCount++;
    }

    if (filters.entityId) {
      conditions.push(`entity_id = $${paramCount}`);
      values.push(filters.entityId);
      paramCount++;
    }

    if (filters.type) {
      // Filter by action prefix (e.g., 'member' for all member actions)
      conditions.push(`action LIKE $${paramCount}`);
      values.push(`${filters.type}.%`);
      paramCount++;
    }

    if (filters.startDate) {
      conditions.push(`created_at >= $${paramCount}`);
      values.push(filters.startDate);
      paramCount++;
    }

    if (filters.endDate) {
      conditions.push(`created_at <= $${paramCount}`);
      values.push(filters.endDate);
      paramCount++;
    }

    const query = `
      SELECT * FROM ${this.tableName}
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    values.push(filters.limit || 50);
    values.push(filters.offset || 0);

    const result = await this.db.query(query, values);
    return result.rows.map(row => this.mapToActivityLog(row));
  }

  /**
   * Get activities for a user
   */
  async getUserActivities(
    userId: string,
    filters: { companyId?: string; limit?: number } = {}
  ): Promise<ActivityLog[]> {
    const conditions = ['user_id = $1'];
    const values: any[] = [userId];
    let paramCount = 2;

    if (filters.companyId) {
      conditions.push(`company_id = $${paramCount}`);
      values.push(filters.companyId);
      paramCount++;
    }

    const query = `
      SELECT * FROM ${this.tableName}
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${paramCount}
    `;

    values.push(filters.limit || 50);

    const result = await this.db.query(query, values);
    return result.rows.map(row => this.mapToActivityLog(row));
  }

  /**
   * Get activity statistics
   */
  async getActivityStats(
    companyId: string,
    period: string = '30d'
  ): Promise<{
    totalActivities: number;
    uniqueUsers: number;
    topActions: { action: string; count: number }[];
    activityByDay: { date: string; count: number }[];
  }> {
    const interval = this.getPeriodInterval(period);

    // Get total activities and unique users
    const statsQuery = `
      SELECT 
        COUNT(*) as total_activities,
        COUNT(DISTINCT user_id) as unique_users
      FROM ${this.tableName}
      WHERE company_id = $1 
        AND created_at >= NOW() - INTERVAL '${interval}'
    `;

    const statsResult = await this.db.query(statsQuery, [companyId]);

    // Get top actions
    const topActionsQuery = `
      SELECT 
        action,
        COUNT(*) as count
      FROM ${this.tableName}
      WHERE company_id = $1 
        AND created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY action
      ORDER BY count DESC
      LIMIT 10
    `;

    const topActionsResult = await this.db.query(topActionsQuery, [companyId]);

    // Get activity by day
    const activityByDayQuery = `
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM ${this.tableName}
      WHERE company_id = $1 
        AND created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;

    const activityByDayResult = await this.db.query(activityByDayQuery, [companyId]);

    return {
      totalActivities: parseInt(statsResult.rows[0].total_activities),
      uniqueUsers: parseInt(statsResult.rows[0].unique_users),
      topActions: topActionsResult.rows.map(row => ({
        action: row.action,
        count: parseInt(row.count)
      })),
      activityByDay: activityByDayResult.rows.map(row => ({
        date: row.date.toISOString().split('T')[0],
        count: parseInt(row.count)
      }))
    };
  }

  /**
   * Clean up old activity logs
   */
  async cleanupOldLogs(retentionDays: number = 90): Promise<number> {
    const query = `
      DELETE FROM ${this.tableName}
      WHERE created_at < NOW() - INTERVAL '${retentionDays} days'
    `;

    const result = await this.db.query(query);
    return result.rowCount;
  }

  /**
   * Batch log activities
   */
  async batchLog(activities: Omit<ActivityLog, 'id' | 'createdAt'>[]): Promise<void> {
    if (activities.length === 0) return;

    const values: any[] = [];
    const placeholders: string[] = [];
    let paramCount = 1;

    activities.forEach(activity => {
      const rowPlaceholders = [];
      
      values.push(this.generateId());
      rowPlaceholders.push(`$${paramCount++}`);
      
      values.push(activity.companyId || null);
      rowPlaceholders.push(`$${paramCount++}`);
      
      values.push(activity.userId);
      rowPlaceholders.push(`$${paramCount++}`);
      
      values.push(activity.userEmail || null);
      rowPlaceholders.push(`$${paramCount++}`);
      
      values.push(activity.action);
      rowPlaceholders.push(`$${paramCount++}`);
      
      values.push(activity.entityType);
      rowPlaceholders.push(`$${paramCount++}`);
      
      values.push(activity.entityId || null);
      rowPlaceholders.push(`$${paramCount++}`);
      
      values.push(JSON.stringify(activity.metadata || {}));
      rowPlaceholders.push(`$${paramCount++}`);
      
      values.push(activity.ipAddress || null);
      rowPlaceholders.push(`$${paramCount++}`);
      
      values.push(activity.userAgent || null);
      rowPlaceholders.push(`$${paramCount++}`);
      
      values.push(new Date());
      rowPlaceholders.push(`$${paramCount++}`);

      placeholders.push(`(${rowPlaceholders.join(', ')})`);
    });

    const query = `
      INSERT INTO ${this.tableName} (
        id, company_id, user_id, user_email, action, 
        entity_type, entity_id, metadata, ip_address, 
        user_agent, created_at
      ) VALUES ${placeholders.join(', ')}
    `;

    await this.db.query(query, values);
  }

  /**
   * Private helper methods
   */

  private generateId(): string {
    return `act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private mapToActivityLog(row: any): ActivityLog {
    return {
      id: row.id,
      companyId: row.company_id,
      userId: row.user_id,
      userEmail: row.user_email,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: row.created_at
    };
  }

  private getPeriodInterval(period: string): string {
    const periodMap: Record<string, string> = {
      '7d': '7 days',
      '30d': '30 days',
      '90d': '90 days',
      '1y': '1 year'
    };
    return periodMap[period] || '30 days';
  }

  /**
   * Subscribe to activity events
   */
  onActivity(callback: (activity: any) => void) {
    this.eventEmitter.on('activity:logged', callback);
  }
}

