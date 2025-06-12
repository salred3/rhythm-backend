import { DatabaseService } from '../../../common/database/database.service';
import { QueryBuilder } from '../../../common/database/query-builder';

interface Invitation {
  id: string;
  companyId: string;
  email: string;
  role: string;
  token: string;
  invitedBy: string;
  invitedByEmail: string;
  message?: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';
  expiresAt: Date;
  acceptedAt?: Date;
  declinedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  metadata?: any;
}

interface InvitationFilters {
  status?: string;
  email?: string;
  role?: string;
}

export class InvitationsRepository {
  private db: DatabaseService;
  private tableName = 'company_invitations';

  constructor() {
    this.db = DatabaseService.getInstance();
  }

  /**
   * Create a new invitation
   */
  async create(data: Invitation): Promise<Invitation> {
    const query = `
      INSERT INTO ${this.tableName} (
        id, company_id, email, role, token, invited_by, invited_by_email,
        message, status, expires_at, created_at, updated_at, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;

    const values = [
      data.id,
      data.companyId,
      data.email,
      data.role,
      data.token,
      data.invitedBy,
      data.invitedByEmail,
      data.message || null,
      data.status,
      data.expiresAt,
      data.createdAt,
      data.updatedAt,
      JSON.stringify(data.metadata || {})
    ];

    const result = await this.db.query(query, values);
    return this.mapToInvitation(result.rows[0]);
  }

  /**
   * Find invitation by ID
   */
  async findById(id: string): Promise<Invitation | null> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE id = $1
    `;

    const result = await this.db.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapToInvitation(result.rows[0]);
  }

  /**
   * Find invitation by token
   */
  async findByToken(token: string): Promise<Invitation | null> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE token = $1
    `;

    const result = await this.db.query(query, [token]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapToInvitation(result.rows[0]);
  }

  /**
   * Find pending invitation by email
   */
  async findPendingByEmail(companyId: string, email: string): Promise<Invitation | null> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE company_id = $1 
        AND LOWER(email) = LOWER($2)
        AND status = 'pending'
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const result = await this.db.query(query, [companyId, email]);
    
    if (result.rows.length === 0) {
      return null;
    }

    return this.mapToInvitation(result.rows[0]);
  }

  /**
   * Find invitations by company
   */
  async findByCompany(companyId: string, filters: InvitationFilters = {}): Promise<Invitation[]> {
    const qb = new QueryBuilder();
    
    qb.select('*')
      .from(this.tableName)
      .where('company_id = $1', companyId);

    let paramCount = 2;

    if (filters.status) {
      qb.where(`status = $${paramCount}`, filters.status);
      paramCount++;
    }

    if (filters.email) {
      qb.where(`LOWER(email) = LOWER($${paramCount})`, filters.email);
      paramCount++;
    }

    if (filters.role) {
      qb.where(`role = $${paramCount}`, filters.role);
      paramCount++;
    }

    qb.orderBy('created_at', 'DESC');

    const result = await this.db.query(qb.build(), qb.getValues());
    return result.rows.map(row => this.mapToInvitation(row));
  }

  /**
   * Update invitation
   */
  async update(id: string, data: Partial<Invitation>): Promise<Invitation> {
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    // Build dynamic update query
    Object.entries(data).forEach(([key, value]) => {
      if (key !== 'id' && value !== undefined) {
        const dbKey = this.camelToSnake(key);
        
        if (key === 'metadata') {
          updateFields.push(`${dbKey} = $${paramCount}`);
          values.push(JSON.stringify(value));
        } else {
          updateFields.push(`${dbKey} = $${paramCount}`);
          values.push(value);
        }
        paramCount++;
      }
    });

    values.push(id); // For WHERE clause

    const query = `
      UPDATE ${this.tableName}
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await this.db.query(query, values);
    return this.mapToInvitation(result.rows[0]);
  }

  /**
   * Update invitation status
   */
  async updateStatus(
    id: string, 
    status: Invitation['status'],
    additionalData?: { acceptedAt?: Date; declinedAt?: Date }
  ): Promise<void> {
    const updateFields = ['status = $1', 'updated_at = $2'];
    const values = [status, new Date()];
    let paramCount = 3;

    if (additionalData?.acceptedAt) {
      updateFields.push(`accepted_at = $${paramCount}`);
      values.push(additionalData.acceptedAt);
      paramCount++;
    }

    if (additionalData?.declinedAt) {
      updateFields.push(`declined_at = $${paramCount}`);
      values.push(additionalData.declinedAt);
      paramCount++;
    }

    values.push(id); // For WHERE clause

    const query = `
      UPDATE ${this.tableName}
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
    `;

    await this.db.query(query, values);
  }

  /**
   * Get invitation statistics
   */
  async getStats(companyId: string): Promise<{
    total: number;
    pending: number;
    accepted: number;
    declined: number;
    expired: number;
    acceptanceRate: number;
  }> {
    const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'accepted') as accepted,
        COUNT(*) FILTER (WHERE status = 'declined') as declined,
        COUNT(*) FILTER (WHERE status = 'expired') as expired
      FROM ${this.tableName}
      WHERE company_id = $1
    `;

    const result = await this.db.query(query, [companyId]);
    const stats = result.rows[0];

    const total = parseInt(stats.total);
    const accepted = parseInt(stats.accepted);
    const declined = parseInt(stats.declined);

    return {
      total,
      pending: parseInt(stats.pending),
      accepted,
      declined,
      expired: parseInt(stats.expired),
      acceptanceRate: total > 0 ? (accepted / (accepted + declined)) * 100 : 0
    };
  }

  /**
   * Clean up expired invitations
   */
  async cleanupExpired(): Promise<number> {
    const query = `
      UPDATE ${this.tableName}
      SET status = 'expired', updated_at = $1
      WHERE status = 'pending' 
        AND expires_at < $1
      RETURNING id
    `;

    const result = await this.db.query(query, [new Date()]);
    return result.rowCount;
  }

  /**
   * Get invitations by inviter
   */
  async findByInviter(invitedBy: string, limit: number = 50): Promise<Invitation[]> {
    const query = `
      SELECT * FROM ${this.tableName}
      WHERE invited_by = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    const result = await this.db.query(query, [invitedBy, limit]);
    return result.rows.map(row => this.mapToInvitation(row));
  }

  /**
   * Private helper methods
   */

  private mapToInvitation(row: any): Invitation {
    if (!row) return row;

    return {
      id: row.id,
      companyId: row.company_id,
      email: row.email,
      role: row.role,
      token: row.token,
      invitedBy: row.invited_by,
      invitedByEmail: row.invited_by_email,
      message: row.message,
      status: row.status,
      expiresAt: row.expires_at,
      acceptedAt: row.accepted_at,
      declinedAt: row.declined_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
    };
  }

  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }
}

