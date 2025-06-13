import { Router } from 'express';
import { SchedulerController } from './scheduler.controller';

const controller = new SchedulerController();
export const schedulerRouter: Router = controller.router;
