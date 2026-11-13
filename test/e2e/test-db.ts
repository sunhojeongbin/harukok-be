import * as path from 'node:path';
import { loadEnv } from '../../scripts/env.cjs';
import { assertDestructiveAllowed } from '../../scripts/lib/db-guard.cjs';

export const ROOT = path.resolve(__dirname, '../..');
export const MIGRATIONS_DIR = path.join(ROOT, 'migrations');

/** e2e 는 TEST_DATABASE_URL 만 쓴다. 로컬 harukok_test/harukok_check 가 아니면 거부한다. */
export function testDatabaseUrl(): string {
  const url = loadEnv(ROOT).TEST_DATABASE_URL;
  if (!url) throw new Error('e2e 에는 TEST_DATABASE_URL 이 필요합니다.');
  assertDestructiveAllowed(url);
  return url;
}
