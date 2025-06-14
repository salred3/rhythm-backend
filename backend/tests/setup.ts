import { beforeAll, afterAll } from 'vitest';
import './test-utils/assertions';

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret';
});

afterAll(async () => {
  await new Promise(resolve => setTimeout(resolve, 100));
});
