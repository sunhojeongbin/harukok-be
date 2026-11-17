// DeleteTodoUseCase — 성공 / NOT_FOUND / 권한 / 저장 실패 (CLAUDE.md 5장)
import { BusinessException } from '../../../common/errors/business.exception';
import { TodosErrors } from '../errors/todos.errors';
import {
  fakeStore,
  TODO_ID,
  USER,
} from '../../../../test/fixtures/fake-todos-store';
import { DeleteTodoUseCase } from './delete-todo.usecase';

const DB_DOWN = new Error('fake db down');

async function expectNotFound(promise: Promise<unknown>) {
  await expect(promise).rejects.toBeInstanceOf(BusinessException);
  await expect(promise).rejects.toMatchObject({
    definition: TodosErrors.TODO_NOT_FOUND,
  });
}

describe('DeleteTodoUseCase', () => {
  it('성공: 소프트 삭제하고 끝낸다 (204)', async () => {
    const store = fakeStore({
      softDelete: jest.fn().mockResolvedValue('DELETED'),
    });

    await expect(
      new DeleteTodoUseCase(store).execute(USER, TODO_ID),
    ).resolves.toBeUndefined();
  });

  it('멱등: 이미 삭제한 내 할 일이면 그대로 성공 (204)', async () => {
    const store = fakeStore({
      softDelete: jest.fn().mockResolvedValue('ALREADY_DELETED'),
    });

    await expect(
      new DeleteTodoUseCase(store).execute(USER, TODO_ID),
    ).resolves.toBeUndefined();
  });

  it('NOT_FOUND: 없거나 타인 소유면 TODO_NOT_FOUND', async () => {
    const store = fakeStore({
      softDelete: jest.fn().mockResolvedValue('NOT_FOUND'),
    });

    await expectNotFound(new DeleteTodoUseCase(store).execute(USER, TODO_ID));
  });

  it('권한: Bearer 사용자 ID 를 조건으로 넘긴다', async () => {
    const store = fakeStore({
      softDelete: jest.fn().mockResolvedValue('DELETED'),
    });

    await new DeleteTodoUseCase(store).execute('fake-bearer-user', TODO_ID);

    expect(store.softDelete).toHaveBeenCalledWith('fake-bearer-user', TODO_ID);
  });

  it('저장 실패: 그대로 전파한다', async () => {
    const store = fakeStore({
      softDelete: jest.fn().mockRejectedValue(DB_DOWN),
    });

    await expect(
      new DeleteTodoUseCase(store).execute(USER, TODO_ID),
    ).rejects.toBe(DB_DOWN);
  });
});
