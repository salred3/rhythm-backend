import { Request, Response, Router, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { authGuard } from './guards/auth.guard';
import { validateDto } from '../../common/middleware/validation.middleware';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/reset-password.dto';
import { rateLimiter } from '../../common/middleware/rate-limit.middleware';

export class AuthController {
  public router: Router = Router();
  private authService = new AuthService();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.post('/signup',
      rateLimiter({ windowMs: 15 * 60 * 1000, max: 5 }),
      validateDto(SignupDto),
      this.signup
    );

    this.router.post('/login',
      rateLimiter({ windowMs: 15 * 60 * 1000, max: 10 }),
      validateDto(LoginDto),
      this.login
    );

    this.router.post('/logout', authGuard, this.logout);

    this.router.post('/refresh',
      rateLimiter({ windowMs: 15 * 60 * 1000, max: 30 }),
      this.refreshToken
    );

    this.router.post('/forgot-password',
      rateLimiter({ windowMs: 60 * 60 * 1000, max: 3 }),
      validateDto(ForgotPasswordDto),
      this.forgotPassword
    );

    this.router.post('/reset-password',
      rateLimiter({ windowMs: 15 * 60 * 1000, max: 5 }),
      validateDto(ResetPasswordDto),
      this.resetPassword
    );

    this.router.get('/me', authGuard, this.getCurrentUser);
    this.router.put('/me', authGuard, this.updateProfile);
    this.router.post('/change-password', authGuard, this.changePassword);
    this.router.get('/sessions', authGuard, this.getSessions);
    this.router.delete('/sessions/:sessionId', authGuard, this.revokeSession);
  }

  private signup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const signupData: SignupDto = req.body;
      const result = await this.authService.signup(signupData);

      res.status(201).json({
        success: true,
        data: {
          user: result.user,
          tokens: result.tokens,
        },
        message: 'Account created successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  private login = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const credentials: LoginDto = req.body;
      const userAgent = req.headers['user-agent'] || '';
      const ipAddress = req.ip || req.connection.remoteAddress || '';

      const result = await this.authService.login(credentials, {
        userAgent,
        ipAddress,
        deviceFingerprint: req.body.deviceFingerprint,
      });

      if (result.tokens.refreshToken) {
        res.cookie('refreshToken', result.tokens.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 30 * 24 * 60 * 60 * 1000,
        });
      }

      res.json({
        success: true,
        data: {
          user: result.user,
          accessToken: result.tokens.accessToken,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  private logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user.id;
      const sessionId = (req as any).sessionId;

      await this.authService.logout(userId, sessionId);

      res.clearCookie('refreshToken');

      res.json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  private refreshToken = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refreshToken = (req as any).cookies?.refreshToken || req.body.refreshToken;

      if (!refreshToken) {
        return res.status(401).json({
          success: false,
          message: 'Refresh token not provided',
        });
      }

      const result = await this.authService.refreshTokens(refreshToken);

      if (result.tokens.refreshToken) {
        res.cookie('refreshToken', result.tokens.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 30 * 24 * 60 * 60 * 1000,
        });
      }

      res.json({
        success: true,
        data: {
          accessToken: result.tokens.accessToken,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  private forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body;
      await this.authService.forgotPassword(email);

      res.json({
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent.',
      });
    } catch (error) {
      console.error('Forgot password error:', error);
      res.json({
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent.',
      });
    }
  };

  private resetPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token, newPassword } = req.body;
      await this.authService.resetPassword(token, newPassword);

      res.json({
        success: true,
        message: 'Password reset successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  private getCurrentUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user.id;
      const user = await this.authService.getCurrentUser(userId);

      res.json({
        success: true,
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  };

  private updateProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user.id;
      const updates = req.body;

      const user = await this.authService.updateProfile(userId, updates);

      res.json({
        success: true,
        data: { user },
        message: 'Profile updated successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  private changePassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user.id;
      const { currentPassword, newPassword } = req.body;

      await this.authService.changePassword(userId, currentPassword, newPassword);

      res.json({
        success: true,
        message: 'Password changed successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  private getSessions = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user.id;
      const sessions = await this.authService.getUserSessions(userId);

      res.json({
        success: true,
        data: { sessions },
      });
    } catch (error) {
      next(error);
    }
  };

  private revokeSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user.id;
      const { sessionId } = req.params;

      await this.authService.revokeSession(userId, sessionId);

      res.json({
        success: true,
        message: 'Session revoked successfully',
      });
    } catch (error) {
      next(error);
    }
  };
}
