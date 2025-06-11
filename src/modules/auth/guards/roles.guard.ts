import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../../common/exceptions/app.error';
import { CompanyMemberRepository } from '../../companies/repositories/company-member.repository';

export type Role = 'admin' | 'member' | 'viewer' | 'owner';
export type Permission = 'read' | 'write' | 'delete' | 'manage_team' | 'manage_billing' | 'manage_settings';

const ROLE_HIERARCHY: Record<Role, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
};

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: ['read', 'write', 'delete', 'manage_team', 'manage_billing', 'manage_settings'],
  admin: ['read', 'write', 'delete', 'manage_team', 'manage_settings'],
  member: ['read', 'write'],
  viewer: ['read'],
};

export function rolesGuard(...requiredRoles: Role[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }

      if (req.user.roles.includes('system_admin')) {
        return next();
      }

      const companyId = req.params.companyId || (req.query.companyId as string);
      if (!companyId) {
        throw new AppError('Company context required', 400);
      }

      const userRole = await getUserCompanyRole(req.user.id, companyId);
      if (!userRole) {
        throw new AppError('Access denied: Not a member of this company', 403);
      }

      const hasRequiredRole = requiredRoles.some(role => hasRole(userRole, role));

      if (!hasRequiredRole) {
        throw new AppError(`Access denied: Requires ${requiredRoles.join(' or ')} role`, 403);
      }

      (req as any).companyRole = userRole;
      (req as any).companyId = companyId;

      next();
    } catch (error) {
      next(error);
    }
  };
}

export function permissionGuard(...requiredPermissions: Permission[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }

      const companyId = req.params.companyId || (req.query.companyId as string);
      if (!companyId) {
        throw new AppError('Company context required', 400);
      }

      const userRole = await getUserCompanyRole(req.user.id, companyId);
      if (!userRole) {
        throw new AppError('Access denied: Not a member of this company', 403);
      }

      const userPermissions = ROLE_PERMISSIONS[userRole];
      const hasAllPermissions = requiredPermissions.every(permission =>
        userPermissions.includes(permission)
      );

      if (!hasAllPermissions) {
        throw new AppError(`Access denied: Requires ${requiredPermissions.join(' and ')} permission(s)`, 403);
      }

      (req as any).companyRole = userRole;
      (req as any).companyId = companyId;
      (req as any).permissions = userPermissions;

      next();
    } catch (error) {
      next(error);
    }
  };
}

export function ownershipGuard(
  resourceType: 'task' | 'project' | 'document',
  paramName: string = 'id'
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }

      const resourceId = (req.params as any)[paramName];
      if (!resourceId) {
        throw new AppError('Resource ID required', 400);
      }

      const hasAccess = await checkResourceAccess(
        req.user.id,
        resourceType,
        resourceId,
        (req as any).companyId
      );

      if (!hasAccess) {
        throw new AppError('Access denied: You do not have access to this resource', 403);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export function companyMemberGuard(req: Request, res: Response, next: NextFunction) {
  return rolesGuard('viewer', 'member', 'admin', 'owner')(req, res, next);
}

export function authorize(options: {
  roles?: Role[];
  permissions?: Permission[];
  checkOwnership?: boolean;
  customCheck?: (req: Request) => Promise<boolean>;
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AppError('Authentication required', 401);
      }

      if (options.roles) {
        const companyId = req.params.companyId || (req.query.companyId as string);
        const userRole = await getUserCompanyRole(req.user.id, companyId);

        if (!userRole || !options.roles.some(role => hasRole(userRole, role))) {
          throw new AppError('Insufficient role', 403);
        }
      }

      if (options.permissions) {
        const userPermissions = ROLE_PERMISSIONS[(req as any).companyRole] || [];
        const hasPermissions = options.permissions.every(p => userPermissions.includes(p));

        if (!hasPermissions) {
          throw new AppError('Insufficient permissions', 403);
        }
      }

      if (options.customCheck) {
        const allowed = await options.customCheck(req);
        if (!allowed) {
          throw new AppError('Access denied', 403);
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

async function getUserCompanyRole(userId: string, companyId: string): Promise<Role | null> {
  const memberRepo = new CompanyMemberRepository();
  const member = await memberRepo.findByUserAndCompany(userId, companyId);
  return (member?.role as Role) || null;
}

function hasRole(userRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

async function checkResourceAccess(
  userId: string,
  resourceType: string,
  resourceId: string,
  companyId: string
): Promise<boolean> {
  switch (resourceType) {
    case 'task':
      return true;
    case 'project':
      return true;
    case 'document':
      return true;
    default:
      return false;
  }
}

export const adminOnly = rolesGuard('admin', 'owner');
export const memberOnly = rolesGuard('member', 'admin', 'owner');
export const ownerOnly = rolesGuard('owner');
export const readPermission = permissionGuard('read');
export const writePermission = permissionGuard('write');
export const manageTeamPermission = permissionGuard('manage_team');
