import { JobProcessor } from '../base/job-processor';
import { logger } from '../../common/utils/logger';

export abstract class BaseWorker {
  protected isRunning = false;

  constructor(protected processor: JobProcessor) {}

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('Starting worker');
    await this.processor.start();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    logger.info('Stopping worker');
    this.isRunning = false;
    await this.processor.stop();
  }
}
