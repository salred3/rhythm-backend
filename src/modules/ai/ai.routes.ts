import { Router } from 'express';
import { AIController } from './ai.controller';

const controller = new AIController();
export const aiRouter: Router = controller.router;
