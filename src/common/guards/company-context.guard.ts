import { Request, Response, NextFunction } from 'express';
import { MembersRepository } from '../../modules/companies/repositories/members.repository';
import { HttpException } from '../exceptions/http.exception';

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
  };
  company?: {
    id: string;
    role: string;
    permissions: string[];
  };
}

/**
 * Middleware to validate company context and user membership
 * Attaches company information and user's role to the request
 */
export function companyContextGuard(
  req: Request,
  res: Response,
  next: NextFunction
) {
  return companyContextGuardAsync(req, res, next).catch(next);
}

async function companyContextGuardAsync(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authReq = req as AuthenticatedRequest;
  
  // Get company ID from route params
  const companyId = req.params.id || req.params.companyId;
  
  if (!companyId) {
    throw new HttpException('Company ID is required', 400);
  }

  if (!authReq.user) {
    throw new HttpException('Authentication required', 401);
  }

  try {
    const membersRepository = new MembersRepository();
    
    // Check if user is a member of the company
    const member = await membersRepository.getMemberByUserAndCompany(
      authReq.user.id,
      companyId
    );

    if (!member) {
      throw new HttpException('You are not a member of this company', 403);
    }

    if (!member.isActive || member.status !== 'active') {
      throw new HttpException('Your membership is not active', 403);
    }

    // Attach company context to request
    authReq.company = {
      id: companyId,
      role: member.role,
      permissions: member.permissions || []
    };

    // Update last active timestamp
    await membersRepository.updateLastActive(member.id);

    next();
  } catch (error) {
    if (error instanceof HttpException) {
      throw error;
    }
    throw new HttpException('Failed to validate company access', 500);
  }
}

/**
 * Higher-order middleware to check specific permissions
 */
export function requirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    
    if (!authReq.company) {
      throw new HttpException('Company context required', 400);
    }

    const hasPermission = authReq.company.permissions.some(p => {
      if (p === permission) return true;
      if (p.endsWith('.*')) {
        const prefix = p.slice(0, -2);
        return permission.startsWith(prefix);
      }
      return false;
    });

    if (!hasPermission) {
      throw new HttpException(
        `Permission denied. Required: ${permission}`,
        403
      );
    }

    next();
  };
}

/**
 * Middleware to optionally load company context
 * Used for endpoints that work with or without company context
 */
export function optionalCompanyContext(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const companyId = req.params.id || req.params.companyId || req.query.companyId;
  
  if (!companyId) {
    return next();
  }

  return companyContextGuardAsync(req, res, next).catch(() => {
    // If company context fails, continue without it
    next();
  });
}

