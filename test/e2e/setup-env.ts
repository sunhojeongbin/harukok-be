import { testDatabaseUrl } from './test-db';

// AppModule 을 불러오기 전에 앱이 테스트 DB 를 보도록 맞춘다.
process.env.DATABASE_URL = testDatabaseUrl();
