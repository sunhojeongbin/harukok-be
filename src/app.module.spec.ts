import { Test } from '@nestjs/testing';
import type * as AppModuleFile from './app.module';

// AppModule 은 import 시점에 환경변수를 검증하므로 env 를 맞춘 뒤 불러온다.
// compile() 은 DB 에 연결하지 않는다 (연결은 app.init() 에서).
const loadAppModule = () =>
  jest.requireActual<typeof AppModuleFile>('./app.module').AppModule;

describe('AppModule', () => {
  const original = process.env.DATABASE_URL;

  afterEach(() => {
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
    jest.resetModules();
  });

  it('모듈이 오류 없이 컴파일된다', async () => {
    process.env.DATABASE_URL = 'postgresql://fake@localhost:5432/fake_db';

    const moduleRef = await Test.createTestingModule({
      imports: [loadAppModule()],
    }).compile();

    expect(moduleRef).toBeDefined();
  });

  it('DATABASE_URL 이 없으면 부팅에 실패한다', async () => {
    delete process.env.DATABASE_URL;

    await expect(
      Promise.resolve().then(() =>
        Test.createTestingModule({ imports: [loadAppModule()] }).compile(),
      ),
    ).rejects.toThrow(/DATABASE_URL/);
  });
});
