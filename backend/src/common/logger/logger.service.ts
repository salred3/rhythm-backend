import winston from 'winston';
import path from 'path';

export class Logger {
  private logger: winston.Logger;
  private context: string;

  constructor(context: string) {
    this.context = context;
    
    const logLevel = process.env.LOG_LEVEL || 'info';
    const isProduction = process.env.NODE_ENV === 'production';

    // Define log format
    const logFormat = winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss',
      }),
      winston.format.errors({ stack: true }),
      winston.format.splat(),
      winston.format.json(),
      winston.format.printf(({ timestamp, level, message, context, ...metadata }) => {
        let msg = `${timestamp} [${level.toUpperCase()}] [${context}] ${message}`;
        
        if (Object.keys(metadata).length > 0) {
          msg += ` ${JSON.stringify(metadata)}`;
        }
        
        return msg;
      })
    );

    // Create transports
    const transports: winston.transport[] = [
      // Console transport
      new winston.transports.Console({
        format: isProduction
          ? logFormat
          : winston.format.combine(
              winston.format.colorize(),
              winston.format.simple(),
              logFormat
            ),
      }),
    ];

    // Add file transport in production
    if (isProduction) {
      transports.push(
        new winston.transports.File({
          filename: path.join(process.env.LOG_DIR || './logs', 'error.log'),
          level: 'error',
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        }),
        new winston.transports.File({
          filename: path.join(process.env.LOG_DIR || './logs', 'combined.log'),
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        })
      );
    }

    // Create logger instance
    this.logger = winston.createLogger({
      level: logLevel,
      format: logFormat,
      defaultMeta: { context: this.context },
      transports,
    });
  }

  info(message: string, ...meta: any[]): void {
    this.logger.info(message, ...meta);
  }

  error(message: string, error?: any, ...meta: any[]): void {
    if (error instanceof Error) {
      this.logger.error(message, {
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
        ...meta,
      });
    } else {
      this.logger.error(message, error, ...meta);
    }
  }

  warn(message: string, ...meta: any[]): void {
    this.logger.warn(message, ...meta);
  }

  debug(message: string, ...meta: any[]): void {
    this.logger.debug(message, ...meta);
  }

  verbose(message: string, ...meta: any[]): void {
    this.logger.verbose(message, ...meta);
  }

  /**
   * Log method execution time
   */
  time(label: string): () => void {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      this.debug(`${label} took ${duration}ms`);
    };
  }

  /**
   * Create a child logger with additional context
   */
  child(context: string): Logger {
    return new Logger(`${this.context}:${context}`);
  }

  /**
   * Log HTTP request
   */
  logRequest(req: any, res: any, responseTime: number): void {
    const { method, url, headers, ip } = req;
    const { statusCode } = res;

    const logData = {
      method,
      url,
      statusCode,
      responseTime: `${responseTime}ms`,
      ip: ip || req.connection.remoteAddress,
      userAgent: headers['user-agent'],
      userId: req.user?.id,
    };

    if (statusCode >= 400) {
      this.warn('HTTP Request Error', logData);
    } else {
      this.info('HTTP Request', logData);
    }
  }

  /**
   * Log database query
   */
  logQuery(query: string, params: any[], duration: number): void {
    if (process.env.LOG_QUERIES === 'true') {
      this.debug('Database Query', {
        query,
        params,
        duration: `${duration}ms`,
      });
    }
  }

  /**
   * Log external API call
   */
  logApiCall(service: string, endpoint: string, duration: number, status: number): void {
    const logData = {
      service,
      endpoint,
      duration: `${duration}ms`,
      status,
    };

    if (status >= 400) {
      this.error('External API Error', logData);
    } else {
      this.info('External API Call', logData);
    }
  }
}

// Export singleton for global logger
export const globalLogger = new Logger('App');
