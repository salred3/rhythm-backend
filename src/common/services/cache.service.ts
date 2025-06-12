import * as Redis from 'ioredis';
import { EventEmitter } from 'events';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  compress?: boolean; // Whether to compress large values
}

/**
 * Cache service using Redis for distributed caching
 */
export class CacheService extends EventEmitter {
  private redis: Redis.Redis;
  private isConnected: boolean = false;
  private defaultTTL: number = 3600; // 1 hour default

  constructor() {
    super();
    this.initializeRedis();
  }

  /**
   * Initialize Redis connection
   */
  private initializeRedis(): void {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    this.redis = new Redis(redisUrl, {
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      reconnectOnError: (err) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          // Only reconnect when the error contains "READONLY"
          return true;
        }
        return false;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      enableOfflineQueue: true,
      lazyConnect: false
    });

    // Handle connection events
    this.redis.on('connect', () => {
      console.log('Redis connected');
      this.isConnected = true;
      this.emit('connect');
    });

    this.redis.on('error', (err) => {
      console.error('Redis error:', err);
      this.emit('error', err);
    });

    this.redis.on('close', () => {
      console.log('Redis connection closed');
      this.isConnected = false;
      this.emit('close');
    });

    this.redis.on('ready', () => {
      console.log('Redis ready');
      this.emit('ready');
    });
  }

  /**
   * Get a value from cache
   */
  async get(key: string): Promise<string | null> {
    try {
      const value = await this.redis.get(key);
      
      if (value) {
        // Update access time for LRU tracking
        await this.redis.expire(key, this.defaultTTL);
      }
      
      return value;
    } catch (error) {
      console.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Get a JSON value from cache
   */
  async getJSON<T>(key: string): Promise<T | null> {
    const value = await this.get(key);
    
    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`Failed to parse JSON for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set a value in cache
   */
  async set(key: string, value: string, ttl?: number): Promise<void> {
    try {
      const expiry = ttl || this.defaultTTL;
      await this.redis.setex(key, expiry, value);
    } catch (error) {
      console.error(`Cache set error for key ${key}:`, error);
    }
  }

  /**
   * Set a JSON value in cache
   */
  async setJSON(key: string, value: any, ttl?: number): Promise<void> {
    try {
      const jsonString = JSON.stringify(value);
      await this.set(key, jsonString, ttl);
    } catch (error) {
      console.error(`Failed to stringify JSON for key ${key}:`, error);
    }
  }

  /**
   * Delete a key from cache
   */
  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      console.error(`Cache delete error for key ${key}:`, error);
    }
  }

  /**
   * Delete multiple keys by pattern
   */
  async deletePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(pattern);
      
      if (keys.length > 0) {
        const pipeline = this.redis.pipeline();
        keys.forEach(key => pipeline.del(key));
        await pipeline.exec();
      }
    } catch (error) {
      console.error(`Cache delete pattern error for ${pattern}:`, error);
    }
  }

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`Cache exists error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Set multiple values at once
   */
  async mset(data: Record<string, string>, ttl?: number): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();
      const expiry = ttl || this.defaultTTL;
      
      Object.entries(data).forEach(([key, value]) => {
        pipeline.setex(key, expiry, value);
      });
      
      await pipeline.exec();
    } catch (error) {
      console.error('Cache mset error:', error);
    }
  }

  /**
   * Get multiple values at once
   */
  async mget(keys: string[]): Promise<Record<string, string | null>> {
    try {
      const values = await this.redis.mget(...keys);
      const result: Record<string, string | null> = {};
      
      keys.forEach((key, index) => {
        result[key] = values[index];
      });
      
      return result;
    } catch (error) {
      console.error('Cache mget error:', error);
      return {};
    }
  }

  /**
   * Increment a counter
   */
  async increment(key: string, amount: number = 1): Promise<number> {
    try {
      return await this.redis.incrby(key, amount);
    } catch (error) {
      console.error(`Cache increment error for key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Decrement a counter
   */
  async decrement(key: string, amount: number = 1): Promise<number> {
    try {
      return await this.redis.decrby(key, amount);
    } catch (error) {
      console.error(`Cache decrement error for key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Set value with expiration only if key doesn't exist
   */
  async setNX(key: string, value: string, ttl?: number): Promise<boolean> {
    try {
      const expiry = ttl || this.defaultTTL;
      const result = await this.redis.set(key, value, 'EX', expiry, 'NX');
      return result === 'OK';
    } catch (error) {
      console.error(`Cache setNX error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get remaining TTL for a key
   */
  async ttl(key: string): Promise<number> {
    try {
      return await this.redis.ttl(key);
    } catch (error) {
      console.error(`Cache ttl error for key ${key}:`, error);
      return -2; // Key doesn't exist
    }
  }

  /**
   * Flush all cache (use with caution)
   */
  async flush(): Promise<void> {
    try {
      await this.redis.flushdb();
    } catch (error) {
      console.error('Cache flush error:', error);
    }
  }

  /**
   * Cache wrapper function - get from cache or execute function
   */
  async remember<T>(
    key: string,
    ttl: number,
    callback: () => Promise<T>
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.getJSON<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Execute callback and cache result
    const result = await callback();
    await this.setJSON(key, result, ttl);
    
    return result;
  }

  /**
   * Lock mechanism for distributed operations
   */
  async acquireLock(
    key: string,
    ttl: number = 30
  ): Promise<{ acquired: boolean; lockId?: string }> {
    const lockKey = `lock:${key}`;
    const lockId = `${Date.now()}-${Math.random()}`;
    
    const acquired = await this.setNX(lockKey, lockId, ttl);
    
    return {
      acquired,
      lockId: acquired ? lockId : undefined
    };
  }

  /**
   * Release a lock
   */
  async releaseLock(key: string, lockId: string): Promise<boolean> {
    const lockKey = `lock:${key}`;
    
    // Use Lua script to ensure we only delete our own lock
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    
    try {
      const result = await this.redis.eval(script, 1, lockKey, lockId);
      return result === 1;
    } catch (error) {
      console.error(`Failed to release lock for ${key}:`, error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    connected: boolean;
    memoryUsage: string;
    totalKeys: number;
    hitRate?: number;
  }> {
    try {
      const info = await this.redis.info('memory');
      const dbSize = await this.redis.dbsize();
      
      // Parse memory usage from info
      const memoryMatch = info.match(/used_memory_human:(.+)/);
      const memoryUsage = memoryMatch ? memoryMatch[1].trim() : 'Unknown';
      
      return {
        connected: this.isConnected,
        memoryUsage,
        totalKeys: dbSize
      };
    } catch (error) {
      return {
        connected: false,
        memoryUsage: 'Unknown',
        totalKeys: 0
      };
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }
}

// Export singleton instance
export const cacheService = new CacheService();

