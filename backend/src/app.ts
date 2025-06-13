import fastify, { FastifyInstance, FastifyOptions } from 'fastify';
import { JobManager } from './queues/job-manager';

export async function buildApp(opts: FastifyOptions = {}): Promise<FastifyInstance> {
  const app = fastify(opts);

  // Initialize job manager
  const jobManager = new JobManager(app);
  await jobManager.initialize();

  // Add to Fastify instance for use in routes
  app.decorate('jobManager', jobManager);

  // Graceful shutdown
  app.addHook('onClose', async () => {
    await jobManager.shutdown();
  });

  return app;
}

// Fastify module augmentation
declare module 'fastify' {
  interface FastifyInstance {
    jobManager: JobManager;
    prisma: any; // Placeholder for PrismaClient
  }
}
