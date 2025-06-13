import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { HttpException } from '../exceptions/http.exception';

const prisma = new PrismaClient();

export interface AuthenticatedRequest extends Request {
  user?: { id: string; email: string; companyId?: string; role?: string };
  token?: string;
}

export class AuthMiddleware {
  static async authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        throw new HttpException(401, 'No authorization header provided');
      }
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
      if (!token) {
        throw new HttpException(401, 'No token provided');
      }
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      const user = await prisma.user.findUnique({ where: { id: decoded.userId }, select: { id: true, email: true, isActive: true, companies: { select: { id: true, role: true, company: { select: { id: true, isActive: true } } } } } });
      if (!user || !user.isActive) {
        throw new HttpException(401, 'Invalid or inactive user');
      }
      req.user = { id: user.id, email: user.email, companyId: user.companies[0]?.company.id, role: user.companies[0]?.role };
      req.token = token;
      next();
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
      } else if (error instanceof jwt.JsonWebTokenError) {
        res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
      } else if (error instanceof HttpException) {
        res.status(error.status).json({ error: error.message, code: error.code });
      } else {
        res.status(500).json({ error: 'Authentication error', code: 'AUTH_ERROR' });
      }
    }
  }

  static async refreshToken(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const refreshToken = req.body.refreshToken || req.headers['x-refresh-token'];
      if (!refreshToken) {
        throw new HttpException(401, 'No refresh token provided');
      }
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as any;
      const user = await prisma.user.findUnique({ where: { id: decoded.userId }, select: { id: true, email: true, isActive: true } });
      if (!user || !user.isActive) {
        throw new HttpException(401, 'Invalid user');
      }
      const accessToken = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET!, { expiresIn: '15m' });
      const newRefreshToken = jwt.sign({ userId: user.id }, process.env.JWT_REFRESH_SECRET!, { expiresIn: '7d' });
      res.json({ accessToken, refreshToken: newRefreshToken, expiresIn: 900 });
    } catch (error) {
      next(error);
    }
  }

  static async optionalAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader) { return next(); }
    return AuthMiddleware.authenticate(req, res, next);
  }
}

