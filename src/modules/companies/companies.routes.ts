import { Router } from 'express';
import { CompaniesController } from './companies.controller';

// Create controller instance
const companiesController = new CompaniesController();

// Export the router for use in the main app
export const companiesRouter: Router = companiesController.router;

// Export controller for testing purposes
export { CompaniesController };
