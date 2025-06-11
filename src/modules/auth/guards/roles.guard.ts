import { Request, Response, NextFunction } from 'express';

export function rolesGuard(requiredRole: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = (req as any).user?.role;
    if (userRole === requiredRole) {
      return next();
    }
    res.status(403).json({ message: 'Forbidden' });
  };
}
