import { Request, Response, Router } from 'express';
import DashboardService from './dashboard.service';

export default class DashboardController {
  public router: Router = Router();
  private service = new DashboardService();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.get('/dashboard', this.getAnalytics);
  }

  private getAnalytics = (req: Request, res: Response) => {
    const data = this.service.getAnalytics();
    res.json(data);
  };
}
