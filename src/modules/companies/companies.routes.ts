import { Router } from 'express';
import { CompaniesController } from './companies.controller';

const controller = new CompaniesController();
export const companiesRouter: Router = controller.router;
