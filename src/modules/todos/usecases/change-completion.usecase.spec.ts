// ChangeCompletionUseCase — 성공 / NOT_FOUND / 권한 / 저장 실패 (CLAUDE.md 5장)
import { BusinessException } from '../../../common/errors/business.exception';
import { TodosErrors } from '../errors/todos.errors';
import {
  fakeStore,
  TODO_ID,
  USER,
} from '../../../../test/fixtures/fake-todos-store';
import { ChangeCompletionUseCase } from './change-completion.usecase';

const DB_DOWN = new Error('fake db down');

async function expectNotFound(promise: Promise<unknown>) {
  await expect(promise).rejects.toBeInstanceOf(BusinessException);
  await expect(promise).rejects.toMatchObject({
    definition: TodosErrors.TODO_NOT_FOUND,
  });
}

describe('ChangeCompletionUseCase', () => {
  it('성공: { id, completedAt(ISO) } 를 돌려준다', async () => {
    const completedAt = new Date('2026-11-17T02:00:00.000Z');
    const store = fakeStore({
      setCompleted: jest.fn().mockResolvedValue({ id: TODO_ID, completedAt }),
    });

    await expect(
      new ChangeCompletionUseCase(store).execute(USER, TODO_ID, {
        completed: true,
      }),
    ).resolves.toEqual({
      id: TODO_ID,
      completedAt: '2026-11-17T02:00:00.000Z',
    });
    expect(store.setCompleted).toHaveBeenCalledWith(USER, TODO_ID, true);
  });

  it('성공: 미완료로 되돌리면 completedAt: null', async () => {
    const store = fakeStore({
      setCompleted: jest
        .fn()
        .mockResolvedValue({ id: TODO_ID, completedAt: null }),
    });

    await expect(
      new ChangeCompletionUseCase(store).execute(USER, TODO_ID, {
        completed: false,
      }),
    ).resolves.toEqual({ id: TODO_ID, completedAt: null });
  });

  it('NOT_FOUND: 없거나 · 타인 소유 · 소프트 삭제면 TODO_NOT_FOUND', async () => {
    const store = fakeStore({
      setCompleted: jest.fn().mockResolvedValue(null),
    });

    await expectNotFound(
      new ChangeCompletionUseCase(store).execute(USER, TODO_ID, {
        completed: true,
      }),
    );
  });

  it('권한: Bearer 사용자 ID 를 조건으로 넘긴다', async () => {
    const store = fakeStore({
      setCompleted: jest
        .fn()
        .mockResolvedValue({ id: TODO_ID, completedAt: null }),
    });

    await new ChangeCompletionUseCase(store).execute(
      'fake-bearer-user',
      TODO_ID,
      {
        completed: false,
      },
    );

    expect((store.setCompleted.mock.calls[0] as unknown[])[0]).toBe(
      'fake-bearer-user',
    );
  });

  it('저장 실패: 그대로 전파한다', async () => {
    const store = fakeStore({
      setCompleted: jest.fn().mockRejectedValue(DB_DOWN),
    });

    await expect(
      new ChangeCompletionUseCase(store).execute(USER, TODO_ID, {
        completed: true,
      }),
    ).rejects.toBe(DB_DOWN);
  });
});
