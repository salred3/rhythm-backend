import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { build } from '../../../src/app';
import { createTestDatabase, cleanupTestDatabase } from '../../test-utils/database';
import { PerformanceTracker } from '../../test-utils/performance.helpers';
import { taskFixtures } from '../../fixtures/tasks.fixture';

describe('Performance Scenarios', () => {
  let app: FastifyInstance;
  let testDb: any;
  let perfTracker: PerformanceTracker;
  let authToken: string;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    app = await build({ database: testDb });
    perfTracker = new PerformanceTracker();

    const signupResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: {
        email: 'perf-test@example.com',
        password: 'PerfTest123!',
        name: 'Performance Tester',
        companyName: 'Perf Company',
      },
    });

    authToken = JSON.parse(signupResponse.body).token;
  });

  afterAll(async () => {
    console.log('Performance Report:', perfTracker.report());
    await app.close();
    await cleanupTestDatabase(testDb);
  });

  it('should handle high-volume task creation', async () => {
    const createTask = async (index: number) => {
      const timer = perfTracker.start('task-creation');

      const response = await app.inject({
        method: 'POST',
        url: '/api/tasks',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          title: `Performance test task ${index}`,
          estimatedMinutes: 60,
          impact: (index % 5) + 1,
          effort: ((index + 2) % 5) + 1,
        },
      });

      timer();
      return response;
    };

    const batchSize = 10;
    const totalTasks = 100;

    for (let i = 0; i < totalTasks; i += batchSize) {
      const batch = Array.from({ length: batchSize }, (_, j) =>
        createTask(i + j)
      );

      const responses = await Promise.all(batch);
      responses.forEach(r => expect(r.statusCode).toBe(201));
    }

    const metrics = perfTracker.getMetrics('task-creation');
    expect(metrics!.p95).toBeLessThan(200);
    expect(metrics!.p99).toBeLessThan(500);
  });
});
