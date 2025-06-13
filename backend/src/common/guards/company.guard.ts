import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Company guard middleware
 * Ensures user has access to the company they're trying to access
 */
export async function companyGuard(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = (req as any).user;
    
    if (!user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    // Get company ID from various sources
    let companyId = req.body.companyId || 
                    req.query.companyId || 
                    req.params.companyId ||
                    req.headers['x-company-id'];

    // If no company ID provided, get user's default company
    if (!companyId) {
      const userWithCompanies = await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          companies: {
            where: { isDefault: true },
            take: 1,
          },
        },
      });

      if (userWithCompanies?.companies.length > 0) {
        companyId = (userWithCompanies.companies[0] as any).companyId;
      }
    }

    if (!companyId) {
      res.status(400).json({
        success: false,
        error: 'Company ID required',
      });
      return;
    }

    // Check if user has access to this company
    const membership = await prisma.companyMember.findUnique({
      where: {
        userId_companyId: {
          userId: user.id,
          companyId: companyId as string,
        },
      },
      include: {
        company: true,
      },
    });

    if (!membership) {
      res.status(403).json({
        success: false,
        error: 'Access denied to this company',
      });
      return;
    }

    // Attach company info to request
    (req as any).company = membership.company;
    (req as any).membership = {
      role: (membership as any).role,
      permissions: (membership as any).permissions,
    };

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Company authorization failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Company admin guard
 * Ensures user is an admin or owner of the company
 */
export async function companyAdminGuard(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // First run company guard
    await companyGuard(req, res, () => {});
    
    if (res.headersSent) {
      return;
    }

    const membership = (req as any).membership;

    if (!membership || !['admin', 'owner'].includes(membership.role)) {
      res.status(403).json({
        success: false,
        error: 'Admin access required',
      });
      return;
    }

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Admin authorization failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
