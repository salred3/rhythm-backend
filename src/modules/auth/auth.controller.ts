import { Request, Response, Router } from 'express';
import { AuthService } from './auth.service';
import { authGuard } from './guards/auth.guard';

export class AuthController {
  public router: Router = Router();
  private service = new AuthService();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.post('/login', this.login);
    this.router.post('/signup', this.signup);
    this.router.get('/me', authGuard, this.me);
  }

  private login = async (req: Request, res: Response) => {
    const token = await this.service.login(req.body);
    res.json(token);
  };

  private signup = async (req: Request, res: Response) => {
    const user = await this.service.signup(req.body);
    res.json(user);
  };

  private me = (req: Request, res: Response) => {
    res.json({ user: (req as any).user || null });
  };
}
