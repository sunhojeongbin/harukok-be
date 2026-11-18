// CreateTodoUseCase — 성공 / NOT_FOUND / 권한 / 저장 실패 (CLAUDE.md 5장)
import {
  fakeStore,
  TODO,
  TODO_RESPONSE,
  USER,
} from '../../../../test/fixtures/fake-todos-store';
import { BusinessException } from '../../../common/errors/business.exception';
import { UsersErrors } from '../../users/errors/users.errors';
import { CreateTodoUseCase } from './create-todo.usecase';

const DB_DOWN = new Error('fake db down');

describe('CreateTodoUseCase', () => {
  const body = { title: '가짜 할 일', dueDate: '2026-11-17' };

  it('성공: 만든 할 일을 completedAt: null 로 돌려준다', async () => {
    const store = fakeStore({ create: jest.fn().mockResolvedValue(TODO) });

    await expect(
      new CreateTodoUseCase(store).execute(USER, body),
    ).resolves.toEqual(TODO_RESPONSE);
    expect(store.create).toHaveBeenCalledWith(USER, '가짜 할 일', '2026-11-17');
  });

  it('NOT_FOUND 계열: 만들기에는 찾을 대상이 없다 — 저장소 결과를 그대로 쓴다', async () => {
    const store = fakeStore({
      create: jest.fn().mockResolvedValue({ ...TODO, title: '다른 제목' }),
    });

    await expect(
      new CreateTodoUseCase(store).execute(USER, body),
    ).resolves.toMatchObject({ title: '다른 제목' });
  });

  // 보안 점검 #6: 탈퇴 후 남은 액세스 토큰(최대 1시간) — FK 위반 500 이 아니라 404
  it('NOT_FOUND: 사용자가 없으면(탈퇴 후 남은 토큰) USER_NOT_FOUND', async () => {
    const store = fakeStore({ create: jest.fn().mockResolvedValue(null) });
    const result = new CreateTodoUseCase(store).execute(USER, body);

    await expect(result).rejects.toBeInstanceOf(BusinessException);
    await expect(result).rejects.toMatchObject({
      definition: UsersErrors.USER_NOT_FOUND,
    });
  });

  it('권한: Bearer 사용자의 할 일로 만든다', async () => {
    const store = fakeStore({ create: jest.fn().mockResolvedValue(TODO) });

    await new CreateTodoUseCase(store).execute('fake-bearer-user', body);

    expect((store.create.mock.calls[0] as unknown[])[0]).toBe(
      'fake-bearer-user',
    );
  });

  it('저장 실패: 그대로 전파한다 (DB CHECK 위반 등)', async () => {
    const store = fakeStore({ create: jest.fn().mockRejectedValue(DB_DOWN) });

    await expect(new CreateTodoUseCase(store).execute(USER, body)).rejects.toBe(
      DB_DOWN,
    );
  });
});
