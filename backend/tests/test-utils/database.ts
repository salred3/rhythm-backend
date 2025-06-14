import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { randomBytes } from 'crypto';

let testDbUrl: string;
let prismaClient: PrismaClient;

export async function createTestDatabase(): Promise<PrismaClient> {
  const dbName = `test_${randomBytes(4).toString('hex')}`;
  const baseUrl = process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/';
  testDbUrl = `${baseUrl}${dbName}`;
  execSync(`createdb ${dbName}`, { stdio: 'ignore' });
  process.env.DATABASE_URL = testDbUrl;
  execSync('npm run db:migrate:deploy', { stdio: 'ignore' });
  prismaClient = new PrismaClient({
    datasources: { db: { url: testDbUrl } },
  });
  await prismaClient.$connect();
  return prismaClient;
}

export async function cleanupTestDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$disconnect();
  const dbName = testDbUrl.split('/').pop();
  execSync(`dropdb ${dbName}`, { stdio: 'ignore' });
}
