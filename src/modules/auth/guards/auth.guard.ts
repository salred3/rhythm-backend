import { Request, Response, NextFunction } from 'express';
import { JwtStrategy } from '../strategies/jwt.strategy';
import { AppError } from '../../../common/exceptions/app.error';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        roles: string[];
      };
      sessionId?: string;
    }
  }
}

const jwtStrategy = new JwtStrategy();

export function authGuard(req: Request, res: Response, next: NextFunction): void {
  authenticateRequest(req, res, next).catch(next);
}

export function optionalAuthGuard(req: Request, res: Response, next: NextFunction): void {
  authenticateRequest(req, res, next, true).catch(() => next());
}

async function authenticateRequest(
  req: Request,
  res: Response,
  next: NextFunction,
  optional: boolean = false
): Promise<void> {
  try {
    const user = await jwtStrategy.validate(req);

    req.user = {
      id: user.id,
      email: user.email,
      roles: user.roles,
    };
    req.sessionId = user.sessionId;

    next();
  } catch (error) {
    if (optional) {
      return next();
    }

    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        code: error.code,
      });
    }

    res.status(401).json({
      success: false,
      message: 'Authentication required',
      code: 'UNAUTHORIZED',
    });
  }
}

export function createAuthGuard(options?: {
  optional?: boolean;
  allowExpired?: boolean;
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await jwtStrategy.validate(req);
      req.user = {
        id: user.id,
        email: user.email,
        roles: user.roles,
      };
      req.sessionId = user.sessionId;
      next();
    } catch (error) {
      if (options?.optional) {
        return next();
      }

      if (options?.allowExpired && error instanceof AppError && error.message === 'Token expired') {
        return next();
      }

      next(error);
    }
  };
}
