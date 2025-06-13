import { Request, Response, NextFunction } from 'express';
import { validate } from 'class-validator';
import { plainToClass } from 'class-transformer';

/**
 * Validation middleware factory
 */
export function validateDto(dtoClass: any) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Transform plain object to DTO instance
      const dto = plainToClass(dtoClass, req.body);

      // Validate DTO
      const errors = await validate(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
        forbidUnknownValues: true,
      });

      if (errors.length > 0) {
        const errorMessages = errors.map(error => {
          const constraints = error.constraints || {};
          return {
            property: error.property,
            errors: Object.values(constraints),
          };
        });

        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errorMessages,
        });
      }

      // Replace request body with validated DTO
      req.body = dto;
      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Validation error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

/**
 * Validate query parameters
 */
export function validateQuery(dtoClass: any) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = plainToClass(dtoClass, req.query);
      const errors = await validate(dto);

      if (errors.length > 0) {
        const errorMessages = errors.map(error => {
          const constraints = error.constraints || {};
          return {
            property: error.property,
            errors: Object.values(constraints),
          };
        });

        return res.status(400).json({
          success: false,
          error: 'Query validation failed',
          details: errorMessages,
        });
      }

      req.query = dto as any;
      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Query validation error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}

/**
 * Validate request params
 */
export function validateParams(dtoClass: any) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const dto = plainToClass(dtoClass, req.params);
      const errors = await validate(dto);

      if (errors.length > 0) {
        const errorMessages = errors.map(error => {
          const constraints = error.constraints || {};
          return {
            property: error.property,
            errors: Object.values(constraints),
          };
        });

        return res.status(400).json({
          success: false,
          error: 'Params validation failed',
          details: errorMessages,
        });
      }

      req.params = dto as any;
      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'Params validation error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
}
