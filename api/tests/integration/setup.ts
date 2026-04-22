import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function startTestDb(): Promise<{ url: string; stop: () => Promise<void> }> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('webtest_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  const url = container.getConnectionUri();

  const migrationsDir = path.resolve(__dirname, '..', '..', 'migrations');
  execSync(`npx node-pg-migrate up -m "${migrationsDir}"`, {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });

  return { url, stop: () => container.stop().then(() => undefined) };
}
