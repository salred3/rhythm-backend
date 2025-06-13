import { BaseWorker } from './base.worker';
import { logger } from '../../common/utils/logger';

export class WorkerManager {
  private workers: BaseWorker[] = [];

  addWorker(worker: BaseWorker): void {
    this.workers.push(worker);
  }

  async startAll(): Promise<void> {
    logger.info('Starting all workers');
    await Promise.all(this.workers.map(w => w.start()));
  }

  async stopAll(): Promise<void> {
    logger.info('Stopping all workers');
    await Promise.all(this.workers.map(w => w.stop()));
  }
}
