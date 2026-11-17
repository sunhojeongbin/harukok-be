import { fakeEnv } from '../fixtures/fake-env';
import { testDatabaseUrl } from './test-db';

// AppModule 을 불러오기 전에 앱이 테스트 DB 를 보도록 맞춘다.
process.env.DATABASE_URL = testDatabaseUrl();

// 시크릿·제공자 키는 항상 가짜 값으로 덮어쓴다 — 로컬 .env 가 무엇이든 e2e 는 실제 시크릿을 쓰지 않는다.
Object.assign(process.env, fakeEnv());
