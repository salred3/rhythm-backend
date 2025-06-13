import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { AuthenticatedRequest } from './auth.middleware';
import { HttpException } from '../exceptions/http.exception';

const redis = new Redis(process.env.REDIS_URL!);

interface RateLimitOptions {
  windowMs?: number;
  max?: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export class RateLimitMiddleware {
  private static defaultOptions: RateLimitOptions = {
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests, please try again later',
    skipSuccessfulRequests: false,
    skipFailedRequests: false
  };

  static create(options: RateLimitOptions = {}) {
    const config = { ...this.defaultOptions, ...options };
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const key = config.keyGenerator ? config.keyGenerator(req) : this.defaultKeyGenerator(req);
        const rateLimitKey = `rate_limit:${key}`;
        const now = Date.now();
        const windowStart = now - config.windowMs!;
        const pipeline = redis.pipeline();
        pipeline.zremrangebyscore(rateLimitKey, 0, windowStart);
        pipeline.zadd(rateLimitKey, now, `${now}-${Math.random()}`);
        pipeline.zcard(rateLimitKey);
        pipeline.expire(rateLimitKey, Math.ceil(config.windowMs! / 1000));
        const results = await pipeline.exec();
        const count = results?.[2]?.[1] as number || 0;
        res.setHeader('X-RateLimit-Limit', config.max!);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, config.max! - count));
        res.setHeader('X-RateLimit-Reset', new Date(now + config.windowMs!).toISOString());
        if (count > config.max!) {
          const oldestEntry = await redis.zrange(rateLimitKey, 0, 0, 'WITHSCORES');
          const oldestTime = oldestEntry[1] ? parseInt(oldestEntry[1]) : now;
          const retryAfter = Math.ceil((oldestTime + config.windowMs! - now) / 1000);
          res.setHeader('Retry-After', retryAfter);
          throw new HttpException(429, config.message!, 'RATE_LIMIT_EXCEEDED');
        }
        if (config.skipSuccessfulRequests || config.skipFailedRequests) {
          const originalSend = res.send;
          res.send = function (data: any) {
            const shouldSkip = (config.skipSuccessfulRequests && res.statusCode < 400) || (config.skipFailedRequests && res.statusCode >= 400);
            if (shouldSkip) { redis.zrem(rateLimitKey, `${now}-${Math.random()}`); }
            return originalSend.call(this, data);
          };
        }
        next();
      } catch (error) {
        if (error instanceof HttpException) {
          res.status(error.status).json({ error: error.message, code: error.code });
        } else {
          console.error('Rate limit middleware error:', error);
          next();
        }
      }
    };
  }

  private static defaultKeyGenerator(req: AuthenticatedRequest): string {
    if (req.user?.id) { return `user:${req.user.id}`; }
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    return `ip:${ip}`;
  }

  static strict = this.create({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many requests from this IP, please try again after 15 minutes' });
  static moderate = this.create({ windowMs: 15 * 60 * 1000, max: 100 });
  static lenient = this.create({ windowMs: 15 * 60 * 1000, max: 500 });
  static auth = this.create({ windowMs: 15 * 60 * 1000, max: 5, message: 'Too many authentication attempts, please try again later', skipSuccessfulRequests: true });
  static api = this.create({ windowMs: 60 * 1000, max: 60, keyGenerator: (req: AuthenticatedRequest) => { if (req.user?.companyId) { return `company:${req.user.companyId}`; } return req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`; } });
  static ai = this.create({ windowMs: 60 * 60 * 1000, max: 100, message: 'AI usage limit exceeded, please try again later', keyGenerator: (req: AuthenticatedRequest) => { return `ai:${req.user?.companyId || req.user?.id || req.ip}`; } });
  static async createDynamic(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) { return RateLimitMiddleware.moderate(req, res, next); }
      const cacheKey = `user_plan:${userId}`;
      let planLimits = await redis.get(cacheKey);
      if (!planLimits) {
        planLimits = JSON.stringify({ requests_per_minute: 100, requests_per_hour: 1000 });
        await redis.setex(cacheKey, 300, planLimits);
      }
      const limits = JSON.parse(planLimits);
      const limiter = RateLimitMiddleware.create({ windowMs: 60 * 1000, max: limits.requests_per_minute });
      return limiter(req, res, next);
    } catch (error) {
      console.error('Dynamic rate limit error:', error);
      return RateLimitMiddleware.moderate(req, res, next);
    }
  }
}

