import { Logger } from '@nestjs/common';
import type { PurgeDeletedTodosUseCase } from '../usecases/purge-deleted-todos.usecase';
import type { PurgeExpiredTokensUseCase } from '../usecases/purge-expired-tokens.usecase';
import { BatchJobs } from './batch.jobs';

function setup(todos: jest.Mock, tokens: jest.Mock) {
  return new BatchJobs(
    { execute: todos } as unknown as PurgeDeletedTodosUseCase,
    { execute: tokens } as unknown as PurgeExpiredTokensUseCase,
  );
}

describe('BatchJobs', () => {
  let logError: jest.SpyInstance;

  beforeEach(() => {
    logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('할 일 정리 스케줄은 PurgeDeletedTodosUseCase 를 실행한다', async () => {
    const todos = jest.fn().mockResolvedValue(1);

    await setup(todos, jest.fn()).runPurgeDeletedTodos();

    expect(todos).toHaveBeenCalledTimes(1);
  });

  it('토큰 정리 스케줄은 PurgeExpiredTokensUseCase 를 실행한다', async () => {
    const tokens = jest.fn().mockResolvedValue(1);

    await setup(jest.fn(), tokens).runPurgeExpiredTokens();

    expect(tokens).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['runPurgeDeletedTodos', 'todos'],
    ['runPurgeExpiredTokens', 'tokens'],
  ] as const)(
    '%s 가 실패해도 예외를 밖으로 던지지 않고 에러 로그를 남긴다',
    async (method, which) => {
      const failing = jest.fn().mockRejectedValue(new Error('fake db down'));
      const jobs =
        which === 'todos'
          ? setup(failing, jest.fn())
          : setup(jest.fn(), failing);

      await expect(jobs[method]()).resolves.toBeUndefined();
      expect(logError).toHaveBeenCalled();
    },
  );
});
