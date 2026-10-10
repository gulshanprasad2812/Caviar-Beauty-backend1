import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const TEST_DB_URL = 'postgresql://caviar:caviar_password@localhost:5432/caviar_beauty_test?schema=public';

export default function globalSetup() {
  const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  execSync('npx prisma db push --accept-data-loss', {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: TEST_DB_URL, DIRECT_URL: TEST_DB_URL },
    stdio: 'inherit',
  });
}
