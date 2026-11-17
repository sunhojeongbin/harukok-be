import { Logger } from '@nestjs/common';
import { BusinessException } from '../../common/errors/business.exception';
import { CurrentTermBootCheck } from './current-term.boot-check';
import { TermsErrors } from './errors/terms.errors';
import type { GetCurrentTermsUseCase } from './usecases/get-current-terms.usecase';

function checkWith(execute: jest.Mock) {
  return new CurrentTermBootCheck({
    execute,
  } as unknown as GetCurrentTermsUseCase);
}

describe('CurrentTermBootCheck', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('시행 중인 이용약관이 있으면 조용히 지나간다', async () => {
    const execute = jest.fn().mockResolvedValue({ id: 'x', version: '1.0' });

    await checkWith(execute).onApplicationBootstrap();

    expect(warn).not.toHaveBeenCalled();
  });

  it('시행 중인 이용약관이 없으면 경고 로그를 남기고 부팅은 계속한다', async () => {
    const execute = jest
      .fn()
      .mockRejectedValue(new BusinessException(TermsErrors.TERM_NOT_FOUND));

    await expect(checkWith(execute).onApplicationBootstrap()).resolves.toBe(
      undefined,
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('이용약관'));
  });

  it('약관 조회 자체가 실패해도 부팅을 막지 않고 경고만 남긴다', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('fake db down'));

    await expect(checkWith(execute).onApplicationBootstrap()).resolves.toBe(
      undefined,
    );
    expect(warn).toHaveBeenCalled();
  });
});
