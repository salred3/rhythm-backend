import { Request, Response, NextFunction } from 'express';
import { validate, ValidationError } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { HttpException } from '../exceptions/http.exception';

/**
 * Middleware factory for validating request bodies against DTOs
 */
export function validationMiddleware<T>(type: any): (req: Request, res: Response, next: NextFunction) => void {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Transform plain object to class instance
      const dto = plainToClass(type, req.body);
      
      // Validate the DTO
      const errors = await validate(dto, {
        whitelist: true, // Strip non-whitelisted properties
        forbidNonWhitelisted: true, // Throw error on non-whitelisted properties
        skipMissingProperties: false
      });

      if (errors.length > 0) {
        const message = errors
          .map((error: ValidationError) => {
            return Object.values(error.constraints || {}).join(', ');
          })
          .join('; ');
        
        throw new HttpException(`Validation failed: ${message}`, 400);
      }

      // Replace request body with validated DTO
      req.body = dto;
      next();
    } catch (error) {
      if (error instanceof HttpException) {
        next(error);
      } else {
        next(new HttpException('Validation failed', 400));
      }
    }
  };
}

/**
 * Middleware for validating query parameters
 */
export function validateQuery<T>(type: any): (req: Request, res: Response, next: NextFunction) => void {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = plainToClass(type, req.query);
      const errors = await validate(dto, {
        whitelist: true,
        skipMissingProperties: true // Query params are often optional
      });

      if (errors.length > 0) {
        const message = errors
          .map((error: ValidationError) => {
            return Object.values(error.constraints || {}).join(', ');
          })
          .join('; ');
        
        throw new HttpException(`Invalid query parameters: ${message}`, 400);
      }

      req.query = dto;
      next();
    } catch (error) {
      if (error instanceof HttpException) {
        next(error);
      } else {
        next(new HttpException('Query validation failed', 400));
      }
    }
  };
}

/**
 * Middleware for validating route parameters
 */
export function validateParams<T>(type: any): (req: Request, res: Response, next: NextFunction) => void {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = plainToClass(type, req.params);
      const errors = await validate(dto);

      if (errors.length > 0) {
        const message = errors
          .map((error: ValidationError) => {
            return Object.values(error.constraints || {}).join(', ');
          })
          .join('; ');
        
        throw new HttpException(`Invalid route parameters: ${message}`, 400);
      }

      req.params = dto;
      next();
    } catch (error) {
      if (error instanceof HttpException) {
        next(error);
      } else {
        next(new HttpException('Parameter validation failed', 400));
      }
    }
  };
}

/**
 * Custom validation decorators
 */
export function IsUUID(validationOptions?: any) {
  return function (object: Object, propertyName: string) {
    // Implementation would use class-validator's registerDecorator
    // This is a placeholder for the actual implementation
  };
}

/**
 * Sanitization middleware to clean input data
 */
export function sanitizeInput(req: Request, res: Response, next: NextFunction) {
  // Recursively clean input data
  const sanitize = (obj: any): any => {
    if (typeof obj === 'string') {
      return obj.trim();
    }
    if (Array.isArray(obj)) {
      return obj.map(sanitize);
    }
    if (obj !== null && typeof obj === 'object') {
      const sanitized: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          sanitized[key] = sanitize(obj[key]);
        }
      }
      return sanitized;
    }
    return obj;
  };

  req.body = sanitize(req.body);
  req.query = sanitize(req.query);
  req.params = sanitize(req.params);
  
  next();
}

