/**
 * Custom HTTP Exception class for consistent error handling
 */
export class HttpException extends Error {
  public status: number;
  public message: string;
  public details?: any;

  constructor(message: string, status: number, details?: any) {
    super(message);
    this.status = status;
    this.message = message;
    this.details = details;
    this.name = 'HttpException';

    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert exception to JSON response format
   */
  toJSON() {
    return {
      success: false,
      error: {
        status: this.status,
        message: this.message,
        details: this.details,
        timestamp: new Date().toISOString()
      }
    };
  }
}

/**
 * Common HTTP exceptions
 */
export class BadRequestException extends HttpException {
  constructor(message: string = 'Bad Request', details?: any) {
    super(message, 400, details);
    this.name = 'BadRequestException';
  }
}

export class UnauthorizedException extends HttpException {
  constructor(message: string = 'Unauthorized', details?: any) {
    super(message, 401, details);
    this.name = 'UnauthorizedException';
  }
}

export class ForbiddenException extends HttpException {
  constructor(message: string = 'Forbidden', details?: any) {
    super(message, 403, details);
    this.name = 'ForbiddenException';
  }
}

export class NotFoundException extends HttpException {
  constructor(message: string = 'Not Found', details?: any) {
    super(message, 404, details);
    this.name = 'NotFoundException';
  }
}

export class ConflictException extends HttpException {
  constructor(message: string = 'Conflict', details?: any) {
    super(message, 409, details);
    this.name = 'ConflictException';
  }
}

export class TooManyRequestsException extends HttpException {
  constructor(message: string = 'Too Many Requests', details?: any) {
    super(message, 429, details);
    this.name = 'TooManyRequestsException';
  }
}

export class InternalServerErrorException extends HttpException {
  constructor(message: string = 'Internal Server Error', details?: any) {
    super(message, 500, details);
    this.name = 'InternalServerErrorException';
  }
}

/**
 * Global error handler middleware
 */
export function errorHandler(
  err: Error | HttpException,
  req: any,
  res: any,
  next: any
) {
  // Default to 500 server error
  let status = 500;
  let message = 'Internal Server Error';
  let details = undefined;

  // If it's our custom HttpException
  if (err instanceof HttpException) {
    status = err.status;
    message = err.message;
    details = err.details;
  } else if (err instanceof Error) {
    // For other errors, log them and send generic message
    console.error('Unhandled error:', err);
    message = process.env.NODE_ENV === 'production' 
      ? 'An error occurred' 
      : err.message;
  }

  // Log error for monitoring
  console.error(`[${new Date().toISOString()}] ${status} - ${message}`, {
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id,
    error: err.stack
  });

  // Send error response
  res.status(status).json({
    success: false,
    error: {
      status,
      message,
      details,
      timestamp: new Date().toISOString(),
      path: req.path
    }
  });
}

/**
 * Async error wrapper for route handlers
 */
export function asyncHandler(fn: Function) {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

