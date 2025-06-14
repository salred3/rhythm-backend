import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { build } from '../../../src/app';
import { createTestDatabase, cleanupTestDatabase } from '../../test-utils/database';

describe('Data Consistency Scenarios', () => {
  let app: FastifyInstance;
  let testDb: any;
  let users: any[] = [];

  beforeAll(async () => {
    testDb = await createTestDatabase();
    app = await build({ database: testDb });

    const signupResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/signup',
      payload: {
        email: 'owner@example.com',
        password: 'Owner123!',
        name: 'Company Owner',
        companyName: 'Consistency Corp',
      },
    });

    const owner = JSON.parse(signupResponse.body);
    users.push(owner);
  });

  afterAll(async () => {
    await app.close();
    await cleanupTestDatabase(testDb);
  });

  it('should maintain task consistency during concurrent updates', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: { authorization: `Bearer ${users[0].token}` },
      payload: {
        title: 'Concurrent update test',
        estimatedMinutes: 60,
        impact: 3,
        effort: 3,
      },
    });

    const task = JSON.parse(createResponse.body);

    const updates = users.map((user, index) =>
      app.inject({
        method: 'PUT',
        url: `/api/tasks/${task.id}`,
        headers: { authorization: `Bearer ${user.token}` },
        payload: {
          title: `Updated by user ${index}`,
          impact: index + 1,
        },
      })
    );

    const results = await Promise.allSettled(updates);
    const successful = results.filter(r =>
      r.status === 'fulfilled' && r.value.statusCode === 200
    );

    expect(successful.length).toBeGreaterThan(0);
    expect(successful.length).toBeLessThan(users.length);
  });
});
