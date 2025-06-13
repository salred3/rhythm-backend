import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { prisma } from '../database/prisma.service';
import { ForbiddenException, NotFoundException, UnauthorizedException } from '../exceptions/http.exception';
import { InsufficientPermissionsException } from '../exceptions/business.exception';

export type CompanyRole = 'owner' | 'admin' | 'manager' | 'member';

interface CompanyAccessOptions {
  roles?: CompanyRole[];
  allowOwnerOnly?: boolean;
  checkActive?: boolean;
  extractCompanyId?: (req: Request) => string | undefined;
}

export class CompanyAccessGuard {
  private static readonly roleHierarchy: Record<CompanyRole, number> = { owner: 4, admin: 3, manager: 2, member: 1 };

  static create(options: CompanyAccessOptions = {}) {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.user) { throw new UnauthorizedException('Authentication required'); }
        const companyId = options.extractCompanyId ? options.extractCompanyId(req) : req.params.companyId || req.body.companyId || req.query.companyId as string;
        if (!companyId) { throw new ForbiddenException('Company ID is required'); }
        const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, isActive: true, members: { where: { userId: req.user.id }, select: { role: true, isActive: true, permissions: true } } } });
        if (!company) { throw new NotFoundException('Company not found'); }
        if (options.checkActive && !company.isActive) { throw new ForbiddenException('Company is inactive'); }
        const membership = company.members[0];
        if (!membership) { throw new ForbiddenException('You are not a member of this company'); }
        if (!membership.isActive) { throw new ForbiddenException('Your membership is inactive'); }
        if (options.allowOwnerOnly && membership.role !== 'owner') {
          throw new InsufficientPermissionsException('company', 'access', 'owner');
        }
        if (options.roles && options.roles.length > 0) {
          const hasRequiredRole = options.roles.includes(membership.role as CompanyRole);
          if (!hasRequiredRole) {
            throw new InsufficientPermissionsException('company', 'access', options.roles.join(' or '));
          }
        }
        (req as any).company = { id: company.id, membership: { role: membership.role, permissions: membership.permissions } };
        next();
      } catch (error) {
        next(error);
      }
    };
  }

  static hasMinimumRole(options: { minimumRole: CompanyRole }) {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const userRole = (req as any).company?.membership?.role;
        if (!userRole) { throw new ForbiddenException('Company membership not found'); }
        const userLevel = this.roleHierarchy[userRole as CompanyRole] || 0;
        const requiredLevel = this.roleHierarchy[options.minimumRole];
        if (userLevel < requiredLevel) {
          throw new InsufficientPermissionsException('resource', 'access', `${options.minimumRole} or higher`);
        }
        next();
      } catch (error) {
        next(error);
      }
    };
  }

  static hasPermission(permission: string | string[]) {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      const permissions = (req as any).company?.membership?.permissions || [];
      const requiredPermissions = Array.isArray(permission) ? permission : [permission];
      const hasPermission = requiredPermissions.every(p => permissions.includes(p));
      if (!hasPermission) {
        next(new InsufficientPermissionsException('resource', 'access', requiredPermissions.join(', ')));
        return;
      }
      next();
    };
  }

  static async verifyResourceOwnership(req: AuthenticatedRequest, resourceType: string, resourceId: string, companyIdField = 'companyId'): Promise<boolean> {
    const companyId = (req as any).company?.id;
    if (!companyId) { return false; }
    const resource = await (prisma as any)[resourceType].findUnique({ where: { id: resourceId }, select: { [companyIdField]: true } });
    return resource && resource[companyIdField] === companyId;
  }

  static verifyOwnership(resourceType: string, options: { resourceIdParam?: string; companyIdField?: string } = {}) {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const resourceId = req.params[options.resourceIdParam || 'id'];
        if (!resourceId) { throw new ForbiddenException('Resource ID is required'); }
        const isOwner = await this.verifyResourceOwnership(req, resourceType, resourceId, options.companyIdField);
        if (!isOwner) {
          throw new ForbiddenException(`You don't have access to this ${resourceType}`);
        }
        next();
      } catch (error) { next(error); }
    };
  }

  static preventCrossCompanyAccess(req: AuthenticatedRequest, targetCompanyId: string): void {
    const userCompanyId = (req as any).company?.id || req.user?.companyId;
    if (!userCompanyId || userCompanyId !== targetCompanyId) {
      throw new ForbiddenException('Cross-company access is not allowed');
    }
  }

  static async getUserCompanies(userId: string) {
    return prisma.companyMember.findMany({
      where: { userId, isActive: true, company: { isActive: true } },
      select: { role: true, permissions: true, company: { select: { id: true, name: true, isActive: true } } }
    });
  }
}

export const requireCompanyMember = CompanyAccessGuard.create();
export const requireCompanyManager = CompanyAccessGuard.create({ roles: ['owner', 'admin', 'manager'] });
export const requireCompanyAdmin = CompanyAccessGuard.create({ roles: ['owner', 'admin'] });
export const requireCompanyOwner = CompanyAccessGuard.create({ allowOwnerOnly: true });

