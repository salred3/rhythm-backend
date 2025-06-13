import { Request, Response, NextFunction } from 'express';
import { HttpException } from '../exceptions/http.exception';
import { BusinessException } from '../exceptions/business.exception';
import { logger } from './logging.middleware';
import { AuthenticatedRequest } from './auth.middleware';

interface ErrorResponse {
  error: {
    message: string;
    code: string;
    statusCode: number;
    timestamp: string;
    path: string;
    method: string;
    correlationId?: string;
    details?: any;
  };
}

export class ErrorHandlerMiddleware {
  static handle(error: Error, req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    const correlationId = (req as any).correlationId;
    const timestamp = new Date().toISOString();
    let statusCode = 500;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';
    let details: any = undefined;
    if (error instanceof HttpException) {
      statusCode = error.status;
      message = error.message;
      code = error.code || 'HTTP_ERROR';
      details = error.details;
    } else if (error instanceof BusinessException) {
      statusCode = error.statusCode;
      message = error.message;
      code = error.code;
      details = error.details;
    } else if ((error as any).name === 'ValidationError') {
      statusCode = 400;
      message = 'Validation failed';
      code = 'VALIDATION_ERROR';
      details = this.parseValidationError(error);
    } else if ((error as any).name === 'UnauthorizedError') {
      statusCode = 401;
      message = 'Unauthorized';
      code = 'UNAUTHORIZED';
    } else if ((error as any).name === 'CastError') {
      statusCode = 400;
      message = 'Invalid request format';
      code = 'INVALID_FORMAT';
    }
    const logLevel = statusCode >= 500 ? 'error' : 'warn';
    (logger as any)[logLevel]('Request error', {
      correlationId,
      userId: req.user?.id,
      companyId: req.user?.companyId,
      method: req.method,
      path: req.path,
      statusCode,
      error: { message: error.message, code, stack: error.stack, details }
    });
    const errorResponse: ErrorResponse = {
      error: {
        message: this.sanitizeErrorMessage(message, statusCode),
        code,
        statusCode,
        timestamp,
        path: req.path,
        method: req.method,
        correlationId
      }
    };
    if (process.env.NODE_ENV === 'development' || statusCode < 500) {
      errorResponse.error.details = details;
    }
    res.status(statusCode).json(errorResponse);
  }

  private static sanitizeErrorMessage(message: string, statusCode: number): string {
    if (process.env.NODE_ENV === 'production' && statusCode >= 500) {
      return 'An error occurred while processing your request';
    }
    return message;
  }

  private static parseValidationError(error: any): any {
    if (error.errors && Array.isArray(error.errors)) {
      return error.errors.map((err: any) => ({ field: err.path || err.param, message: err.msg || err.message, value: err.value }));
    }
    if (error.errors && typeof error.errors === 'object') {
      return Object.keys(error.errors).map(key => ({ field: key, message: error.errors[key].message || error.errors[key], value: error.errors[key].value }));
    }
    return { raw: error.message };
  }

  static recovery(error: Error, req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    if (res.headersSent) {
      logger.error('Error after headers sent', { error: error.message, path: req.path, method: req.method });
      return next(error);
    }
    if (error.message.includes('ECONNREFUSED')) {
      res.status(503).json({ error: { message: 'Service temporarily unavailable', code: 'SERVICE_UNAVAILABLE', statusCode: 503 } });
      return;
    }
    if (error.message.includes('ETIMEDOUT')) {
      res.status(504).json({ error: { message: 'Request timeout', code: 'GATEWAY_TIMEOUT', statusCode: 504 } });
      return;
    }
    ErrorHandlerMiddleware.handle(error, req, res, next);
  }

  static asyncHandler(fn: Function) {
    return (req: Request, res: Response, next: NextFunction) => { Promise.resolve(fn(req, res, next)).catch(next); };
  }

  static notFound(req: Request, res: Response): void {
    res.status(404).json({ error: { message: 'Resource not found', code: 'NOT_FOUND', statusCode: 404, path: req.path, method: req.method, timestamp: new Date().toISOString() } });
  }
}

