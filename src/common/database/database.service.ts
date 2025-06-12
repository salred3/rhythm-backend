import { Pool, PoolClient, QueryResult } from 'pg';
import { EventEmitter } from 'events';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  ssl?: boolean | { rejectUnauthorized: boolean };
}

export interface Transaction {
  query(text: string, values?: any[]): Promise<QueryResult>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

/**
 * Database service singleton for PostgreSQL operations
 */
export class DatabaseService extends EventEmitter {
  private static instance: DatabaseService;
  private pool: Pool;
  private isConnected: boolean = false;

  private constructor() {
    super();
    this.initializePool();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Initialize database connection pool
   */
  private initializePool(): void {
    const config: DatabaseConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'rhythm',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      max: parseInt(process.env.DB_POOL_SIZE || '20'),
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '2000'),
    };

    // Handle SSL for production
    if (process.env.NODE_ENV === 'production') {
      config.ssl = { rejectUnauthorized: false };
    }

    this.pool = new Pool(config);

    // Handle pool errors
    this.pool.on('error', (err) => {
      console.error('Unexpected database pool error:', err);
      this.emit('error', err);
    });

    // Handle pool connection
    this.pool.on('connect', () => {
      this.isConnected = true;
      this.emit('connect');
    });
  }

  /**
   * Execute a query
   */
  async query(text: string, values?: any[]): Promise<QueryResult> {
    const start = Date.now();
    
    try {
      const result = await this.pool.query(text, values);
      
      // Log slow queries in development
      if (process.env.NODE_ENV === 'development') {
        const duration = Date.now() - start;
        if (duration > 1000) {
          console.warn(`Slow query (${duration}ms):`, text);
        }
      }
      
      return result;
    } catch (error) {
      console.error('Database query error:', error);
      console.error('Query:', text);
      console.error('Values:', values);
      throw error;
    }
  }

  /**
   * Get a client from the pool for transactions
   */
  async getClient(): Promise<PoolClient> {
    return await this.pool.connect();
  }

  /**
   * Begin a transaction
   */
  async beginTransaction(): Promise<Transaction> {
    const client = await this.getClient();
    
    try {
      await client.query('BEGIN');
      
      return {
        query: (text: string, values?: any[]) => client.query(text, values),
        commit: async () => {
          await client.query('COMMIT');
          client.release();
        },
        rollback: async () => {
          await client.query('ROLLBACK');
          client.release();
        }
      };
    } catch (error) {
      client.release();
      throw error;
    }
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.getClient();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check database connection
   */
  async checkConnection(): Promise<boolean> {
    try {
      const result = await this.query('SELECT 1');
      return result.rowCount === 1;
    } catch (error) {
      return false;
    }
  }

  /**
   * Close database connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
    this.isConnected = false;
    this.emit('close');
  }

  /**
   * Get pool statistics
   */
  getPoolStats() {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount
    };
  }
}

/**
 * Query builder helper class
 */
export class QueryBuilder {
  private selectClause: string = '*';
  private fromClause: string = '';
  private joins: string[] = [];
  private whereClauses: string[] = [];
  private groupByClause: string = '';
  private havingClause: string = '';
  private orderByClause: string = '';
  private limitClause: string = '';
  private offsetClause: string = '';
  private values: any[] = [];
  private paramCounter: number = 1;

  select(fields: string): QueryBuilder {
    this.selectClause = fields;
    return this;
  }

  from(table: string): QueryBuilder {
    this.fromClause = table;
    return this;
  }

  join(table: string, condition: string): QueryBuilder {
    this.joins.push(`JOIN ${table} ON ${condition}`);
    return this;
  }

  leftJoin(table: string, condition: string): QueryBuilder {
    this.joins.push(`LEFT JOIN ${table} ON ${condition}`);
    return this;
  }

  rightJoin(table: string, condition: string): QueryBuilder {
    this.joins.push(`RIGHT JOIN ${table} ON ${condition}`);
    return this;
  }

  where(condition: string, value?: any): QueryBuilder {
    if (value !== undefined) {
      this.values.push(value);
    }
    this.whereClauses.push(condition);
    return this;
  }

  groupBy(fields: string): QueryBuilder {
    this.groupByClause = fields;
    return this;
  }

  having(condition: string): QueryBuilder {
    this.havingClause = condition;
    return this;
  }

  orderBy(field: string, direction: 'ASC' | 'DESC' = 'ASC'): QueryBuilder {
    if (this.orderByClause) {
      this.orderByClause += ', ';
    }
    this.orderByClause += `${field} ${direction}`;
    return this;
  }

  limit(count: number): QueryBuilder {
    this.limitClause = `LIMIT ${count}`;
    return this;
  }

  offset(count: number): QueryBuilder {
    this.offsetClause = `OFFSET ${count}`;
    return this;
  }

  build(): string {
    const parts = [
      `SELECT ${this.selectClause}`,
      `FROM ${this.fromClause}`,
      ...this.joins
    ];

    if (this.whereClauses.length > 0) {
      parts.push(`WHERE ${this.whereClauses.join(' AND ')}`);
    }

    if (this.groupByClause) {
      parts.push(`GROUP BY ${this.groupByClause}`);
    }

    if (this.havingClause) {
      parts.push(`HAVING ${this.havingClause}`);
    }

    if (this.orderByClause) {
      parts.push(`ORDER BY ${this.orderByClause}`);
    }

    if (this.limitClause) {
      parts.push(this.limitClause);
    }

    if (this.offsetClause) {
      parts.push(this.offsetClause);
    }

    return parts.join('\n');
  }

  getValues(): any[] {
    return this.values;
  }
}

/**
 * Database migration runner
 */
export class MigrationRunner {
  private db: DatabaseService;

  constructor() {
    this.db = DatabaseService.getInstance();
  }

  async run(migrations: { version: string; up: string; down?: string }[]): Promise<void> {
    // Create migrations table if not exists
    await this.createMigrationsTable();

    // Get applied migrations
    const appliedMigrations = await this.getAppliedMigrations();

    // Run pending migrations
    for (const migration of migrations) {
      if (!appliedMigrations.includes(migration.version)) {
        console.log(`Running migration: ${migration.version}`);
        
        await this.db.transaction(async (client) => {
          // Run migration
          await client.query(migration.up);
          
          // Record migration
          await client.query(
            'INSERT INTO migrations (version, applied_at) VALUES ($1, $2)',
            [migration.version, new Date()]
          );
        });
        
        console.log(`Migration ${migration.version} completed`);
      }
    }
  }

  private async createMigrationsTable(): Promise<void> {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  private async getAppliedMigrations(): Promise<string[]> {
    const result = await this.db.query('SELECT version FROM migrations ORDER BY applied_at');
    return result.rows.map(row => row.version);
  }
}

