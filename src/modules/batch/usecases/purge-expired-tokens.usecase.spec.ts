// PurgeExpiredTokensUseCase — 성공 / 지울 것 없음(NOT_FOUND 계열) / 저장 실패. 권한은 해당 없음 (사용자 요청이 아닌 시스템 작업)
import { Logger } from '@nestjs/common';
import type { BatchStore } from '../repositories/batch.store';
import { PurgeExpiredTokensUseCase } from './purge-expired-tokens.usecase';

function setup(purgeExpiredTokens: jest.Mock) {
  const store: BatchStore = {
    purgeDeletedTodos: jest.fn(),
    purgeExpiredTokens,
  };
  return new PurgeExpiredTokensUseCase(store);
}

describe('PurgeExpiredTokensUseCase', () => {
  let log: jest.SpyInstance;

  beforeEach(() => {
    log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('성공: 지운 건수를 돌려주고 로그로 남긴다', async () => {
    const useCase = setup(jest.fn().mockResolvedValue(12));

    await expect(useCase.execute()).resolves.toBe(12);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('12'));
  });

  it('지울 것이 없으면 0 (오류 아님)', async () => {
    await expect(setup(jest.fn().mockResolvedValue(0)).execute()).resolves.toBe(
      0,
    );
  });

  it('저장 실패: 그대로 전파한다 (스케줄이 잡아 로그로 남긴다)', async () => {
    const error = new Error('fake db down');

    await expect(
      setup(jest.fn().mockRejectedValue(error)).execute(),
    ).rejects.toBe(error);
  });
});
