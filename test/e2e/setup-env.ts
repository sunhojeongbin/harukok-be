import { fakeEnv } from '../fixtures/fake-env';
import { testDatabaseUrl } from './test-db';

// AppModule 을 불러오기 전에 앱이 테스트 DB 를 보도록 맞춘다.
process.env.DATABASE_URL = testDatabaseUrl();

// 시크릿·제공자 키는 항상 가짜 값으로 덮어쓴다 — 로컬 .env 가 무엇이든 e2e 는 실제 시크릿을 쓰지 않는다.
Object.assign(process.env, fakeEnv());

// 요청 제한(1분 30회)은 rate-limit e2e 에서만 검증한다. 다른 e2e 는 요청이 많아 걸리지 않게 크게 푼다
process.env.RATE_LIMIT_PER_MINUTE = '100000';
