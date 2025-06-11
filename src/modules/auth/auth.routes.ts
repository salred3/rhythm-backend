import { Router } from 'express';
import { AuthController } from './auth.controller';

const controller = new AuthController();
export const authRouter: Router = controller.router;
