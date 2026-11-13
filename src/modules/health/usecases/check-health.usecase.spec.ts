import { DataSource } from 'typeorm';
import { BusinessException } from '../../../common/errors/business.exception';
import { HealthErrors } from '../errors/health.errors';
import { CheckHealthUseCase } from './check-health.usecase';

function fakeDataSource(query: jest.Mock, isInitialized = true) {
  return { query, isInitialized } as unknown as DataSource;
}

async function expectDbUnavailable(promise: Promise<unknown>) {
  await expect(promise).rejects.toBeInstanceOf(BusinessException);
  await expect(promise).rejects.toMatchObject({
    definition: HealthErrors.DB_UNAVAILABLE,
  });
}

describe('CheckHealthUseCase', () => {
  afterEach(() => jest.useRealTimers());

  it('성공: DB 가 SELECT 1 에 응답하면 { status: ok, db: up } 을 돌려준다', async () => {
    const query = jest.fn().mockResolvedValue([{ ok: 1 }]);
    const useCase = new CheckHealthUseCase(fakeDataSource(query));

    await expect(useCase.execute()).resolves.toEqual({
      status: 'ok',
      db: 'up',
    });
    expect(query).toHaveBeenCalledWith('SELECT 1 AS ok');
  });

  it('DB 오류: 쿼리가 실패하면 DB_UNAVAILABLE 을 던진다', async () => {
    const query = jest.fn().mockRejectedValue(new Error('fake conn refused'));
    const useCase = new CheckHealthUseCase(fakeDataSource(query));

    await expectDbUnavailable(useCase.execute());
  });

  it('시간 초과: 제한 시간 안에 응답이 없으면 DB_UNAVAILABLE 을 던진다', async () => {
    jest.useFakeTimers();
    const query = jest.fn().mockReturnValue(new Promise(() => undefined));
    const useCase = new CheckHealthUseCase(fakeDataSource(query));

    const result = useCase.execute();
    jest.advanceTimersByTime(CheckHealthUseCase.DB_TIMEOUT_MS);

    await expectDbUnavailable(result);
  });

  it('예상 밖 응답: 결과 행이 없으면 DB_UNAVAILABLE 을 던진다', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const useCase = new CheckHealthUseCase(fakeDataSource(query));

    await expectDbUnavailable(useCase.execute());
  });

  it('미연결: DataSource 가 초기화되지 않았으면 쿼리 없이 DB_UNAVAILABLE 을 던진다', async () => {
    const query = jest.fn();
    const useCase = new CheckHealthUseCase(fakeDataSource(query, false));

    await expectDbUnavailable(useCase.execute());
    expect(query).not.toHaveBeenCalled();
  });

  it('성공 후 시간 초과 타이머를 남기지 않는다', async () => {
    jest.useFakeTimers();
    const query = jest.fn().mockResolvedValue([{ ok: 1 }]);
    const useCase = new CheckHealthUseCase(fakeDataSource(query));

    await useCase.execute();

    expect(jest.getTimerCount()).toBe(0);
  });
});
