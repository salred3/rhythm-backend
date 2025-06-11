import { Request, Response, NextFunction } from 'express';
import { JwtStrategy } from '../strategies/jwt.strategy';

const jwt = new JwtStrategy();

export function authGuard(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization;
  if (token && jwt.verify(token)) {
    return next();
  }
  res.status(401).json({ message: 'Unauthorized' });
}
