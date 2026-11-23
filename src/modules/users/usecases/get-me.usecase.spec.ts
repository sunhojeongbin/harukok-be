import { BusinessException } from '../../../common/errors/business.exception';
import { UsersErrors } from '../errors/users.errors';
import type { UserProfile, UsersStore } from '../repositories/users.store';
import { GetMeUseCase } from './get-me.usecase';

const PROFILE: UserProfile = {
  id: '00000000-0000-7000-8000-000000000001',
  name: '가짜 사용자',
  email: null,
  provider: 'KAKAO',
  createdAt: new Date('2026-11-17T01:02:03.000Z'),
};

function setup(findProfile: jest.Mock) {
  const store = {
    findProfile,
    findLinkedAccounts: jest.fn(),
    deleteUser: jest.fn(),
  } as UsersStore;
  return new GetMeUseCase(store);
}

describe('GetMeUseCase', () => {
  it('성공: 프로필을 { id, name, email, provider, createdAt(ISO) } 로 돌려준다', async () => {
    const useCase = setup(jest.fn().mockResolvedValue(PROFILE));

    await expect(useCase.execute(PROFILE.id)).resolves.toEqual({
      id: PROFILE.id,
      name: '가짜 사용자',
      email: null,
      provider: 'KAKAO',
      createdAt: '2026-11-17T01:02:03.000Z',
    });
  });

  it('NOT_FOUND: 사용자가 없으면(탈퇴 후 남은 토큰) USER_NOT_FOUND', async () => {
    const result = setup(jest.fn().mockResolvedValue(null)).execute('gone');

    await expect(result).rejects.toBeInstanceOf(BusinessException);
    await expect(result).rejects.toMatchObject({
      definition: UsersErrors.USER_NOT_FOUND,
    });
  });

  it('권한: Bearer 의 사용자 ID 로만 조회한다', async () => {
    const findProfile = jest.fn().mockResolvedValue(PROFILE);

    await setup(findProfile).execute('fake-bearer-user');

    expect(findProfile).toHaveBeenCalledWith('fake-bearer-user');
  });

  it('저장 실패: 조회 오류는 그대로 전파한다', async () => {
    const error = new Error('fake db down');

    await expect(
      setup(jest.fn().mockRejectedValue(error)).execute(PROFILE.id),
    ).rejects.toBe(error);
  });
});
