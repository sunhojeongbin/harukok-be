import { resetDatabase } from '../../scripts/db-migrate.cjs';
import { MIGRATIONS_DIR, testDatabaseUrl } from './test-db';

/** 테스트 DB 를 전체 롤백 → 전체 적용으로 초기화한다. */
export default async function globalSetup(): Promise<void> {
  await resetDatabase(testDatabaseUrl(), MIGRATIONS_DIR);
}
