import { queueService } from '../common/queue/queue.service';
import { Logger } from '../common/logger/logger.service';

const logger = new Logger('JobProcessor');

async function startWorker() {
  logger.info('Starting job processor worker...');

  // Graceful shutdown handlers
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully...');
    await queueService.shutdown();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully...');
    await queueService.shutdown();
    process.exit(0);
  });

  // Keep the process alive
  setInterval(() => {
    logger.debug('Worker heartbeat');
  }, 30000); // Every 30 seconds
}

// Start the worker
startWorker().catch((error) => {
  logger.error('Worker failed to start', error);
  process.exit(1);
});

// For Railway deployment, you can run this as a separate service
// railway.toml:
// [[services]]
// name = "worker"
// startCommand = "npm run jobs:worker"
