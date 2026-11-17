import type { DataSource } from 'typeorm';
import {
  type LoginCommand,
  type LoginResult,
  PgLoginStore,
} from './login.store';

const RESULT: LoginResult = {
  userId: 'fake-user',
  isNewUser: false,
  name: null,
  providers: ['GOOGLE'],
};
const COMMAND = {} as LoginCommand;

const uniqueViolation = (constraint: string) => ({
  driverError: { code: '23505', constraint },
});

function storeWith(transaction: jest.Mock) {
  return new PgLoginStore({ transaction } as unknown as DataSource);
}

describe('PgLoginStore.login 재시도', () => {
  it('같은 소셜 계정의 동시 첫 가입(UNIQUE 위반)이면 한 번 더 처리한다 → 기존 사용자 로그인', async () => {
    const transaction = jest
      .fn()
      .mockRejectedValueOnce(
        uniqueViolation('uq_user_social_accounts_provider_user_id'),
      )
      .mockResolvedValueOnce(RESULT);

    await expect(storeWith(transaction).login(COMMAND)).resolves.toBe(RESULT);
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('다른 제약의 UNIQUE 위반은 재시도하지 않는다', async () => {
    const error = uniqueViolation('uq_refresh_tokens_token_hash');
    const transaction = jest.fn().mockRejectedValue(error);

    await expect(storeWith(transaction).login(COMMAND)).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('그 밖의 오류는 재시도하지 않고 그대로 전파한다', async () => {
    const error = new Error('fake db down');
    const transaction = jest.fn().mockRejectedValue(error);

    await expect(storeWith(transaction).login(COMMAND)).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('재시도는 한 번뿐이다 (두 번째도 실패하면 전파)', async () => {
    const error = uniqueViolation('uq_user_social_accounts_provider_user_id');
    const transaction = jest.fn().mockRejectedValue(error);

    await expect(storeWith(transaction).login(COMMAND)).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledTimes(2);
  });
});
