import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';
import { AuthenticatedRequest } from './auth.middleware';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'rhythm-api' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.File({ filename: 'error.log', level: 'error' }));
  logger.add(new winston.transports.File({ filename: 'combined.log' }));
}

interface LogContext {
  correlationId: string;
  userId?: string;
  companyId?: string;
  method: string;
  path: string;
  ip: string;
  userAgent?: string;
}

export class LoggingMiddleware {
  private static sanitizeData(data: any): any {
    if (!data) return data;
    const sensitiveFields = ['password', 'token', 'accessToken', 'refreshToken', 'apiKey', 'secret', 'ssn', 'creditCard', 'cvv'];
    if (typeof data === 'object') {
      const sanitized = { ...data };
      for (const key in sanitized) {
        if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
          sanitized[key] = '[REDACTED]';
        } else if (typeof sanitized[key] === 'object') {
          sanitized[key] = this.sanitizeData(sanitized[key]);
        }
      }
      return sanitized;
    }
    return data;
  }

  static requestLogger(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    const startTime = Date.now();
    const correlationId = req.headers['x-correlation-id'] as string || uuidv4();
    (req as any).correlationId = correlationId;
    res.setHeader('X-Correlation-ID', correlationId);
    const context: LogContext = {
      correlationId,
      userId: req.user?.id,
      companyId: req.user?.companyId,
      method: req.method,
      path: req.path,
      ip: req.ip || req.socket.remoteAddress || 'unknown',
      userAgent: req.headers['user-agent']
    };
    logger.info('Incoming request', {
      ...context,
      query: this.sanitizeData(req.query),
      body: this.sanitizeData(req.body),
      headers: this.sanitizeData({ ...req.headers, authorization: req.headers.authorization ? '[REDACTED]' : undefined })
    });
    const originalSend = res.send;
    let responseBody: any;
    res.send = function (data: any) { responseBody = data; return originalSend.call(this, data); };
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const logData: any = { ...context, statusCode: res.statusCode, duration, responseSize: res.get('content-length') };
      if (res.statusCode >= 400) {
        try { const body = typeof responseBody === 'string' ? JSON.parse(responseBody) : responseBody; logData['response'] = this.sanitizeData(body); } catch (e) { logData['response'] = responseBody; }
      }
      const logLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      (logger as any)[logLevel]('Request completed', logData);
      if (duration > 1000) {
        logger.warn('Slow request detected', { ...context, duration, threshold: 1000 });
      }
    });
    next();
  }

  static errorLogger(err: Error, req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    const correlationId = (req as any).correlationId || uuidv4();
    logger.error('Unhandled error', {
      correlationId,
      userId: req.user?.id,
      companyId: req.user?.companyId,
      method: req.method,
      path: req.path,
      error: { message: err.message, stack: err.stack, name: err.name }
    });
    next(err);
  }
}

export { logger };

