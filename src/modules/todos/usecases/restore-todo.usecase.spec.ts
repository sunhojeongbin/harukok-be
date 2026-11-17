// RestoreTodoUseCase — 성공 / NOT_FOUND / 권한 / 저장 실패 (CLAUDE.md 5장)
import { BusinessException } from '../../../common/errors/business.exception';
import { TodosErrors } from '../errors/todos.errors';
import {
  fakeStore,
  TODO,
  TODO_ID,
  TODO_RESPONSE,
  USER,
} from '../../../../test/fixtures/fake-todos-store';
import { RestoreTodoUseCase } from './restore-todo.usecase';

const DB_DOWN = new Error('fake db down');

async function expectNotFound(promise: Promise<unknown>) {
  await expect(promise).rejects.toBeInstanceOf(BusinessException);
  await expect(promise).rejects.toMatchObject({
    definition: TodosErrors.TODO_NOT_FOUND,
  });
}

describe('RestoreTodoUseCase', () => {
  it('성공: 복구된(또는 이미 살아 있는) 할 일을 돌려준다', async () => {
    const store = fakeStore({ restore: jest.fn().mockResolvedValue(TODO) });

    await expect(
      new RestoreTodoUseCase(store).execute(USER, TODO_ID),
    ).resolves.toEqual(TODO_RESPONSE);
  });

  it('NOT_FOUND: 없거나 · 타인 소유 · 하드 삭제됐으면 TODO_NOT_FOUND', async () => {
    const store = fakeStore({ restore: jest.fn().mockResolvedValue(null) });

    await expectNotFound(new RestoreTodoUseCase(store).execute(USER, TODO_ID));
  });

  it('권한: Bearer 사용자 ID 를 조건으로 넘긴다', async () => {
    const store = fakeStore({ restore: jest.fn().mockResolvedValue(TODO) });

    await new RestoreTodoUseCase(store).execute('fake-bearer-user', TODO_ID);

    expect(store.restore).toHaveBeenCalledWith('fake-bearer-user', TODO_ID);
  });

  it('저장 실패: 그대로 전파한다', async () => {
    const store = fakeStore({ restore: jest.fn().mockRejectedValue(DB_DOWN) });

    await expect(
      new RestoreTodoUseCase(store).execute(USER, TODO_ID),
    ).rejects.toBe(DB_DOWN);
  });
});
