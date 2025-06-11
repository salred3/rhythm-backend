import { Request, Response, Router } from 'express';
import { CompaniesService } from './companies.service';
import { MembersService } from './members.service';
import { InvitationsService } from './invitations.service';
import { authGuard } from '../auth/guards/auth.guard';

export class CompaniesController {
  public router: Router = Router();
  private companies = new CompaniesService();
  private members = new MembersService();
  private invitations = new InvitationsService();

  constructor() {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.router.post('/', authGuard, this.create);
    this.router.get('/', authGuard, this.list);
    this.router.post('/:id/invite', authGuard, this.invite);
  }

  private create = async (req: Request, res: Response) => {
    const company = await this.companies.create(req.body);
    res.json(company);
  };

  private list = async (_req: Request, res: Response) => {
    const companies = await this.companies.findAll();
    res.json(companies);
  };

  private invite = async (req: Request, res: Response) => {
    const invitation = await this.invitations.invite({
      companyId: req.params.id,
      email: req.body.email,
    });
    await this.members.addMember(req.params.id, req.body.email);
    res.json(invitation);
  };
}
