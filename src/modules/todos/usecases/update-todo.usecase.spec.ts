// UpdateTodoUseCase — 성공 / NOT_FOUND / 권한 / 저장 실패 (CLAUDE.md 5장)
import { BusinessException } from '../../../common/errors/business.exception';
import { CommonErrors } from '../../../common/errors/common.errors';
import { TodosErrors } from '../errors/todos.errors';
import {
  fakeStore,
  TODO,
  TODO_ID,
  USER,
} from '../../../../test/fixtures/fake-todos-store';
import { UpdateTodoUseCase } from './update-todo.usecase';

const DB_DOWN = new Error('fake db down');

async function expectNotFound(promise: Promise<unknown>) {
  await expect(promise).rejects.toBeInstanceOf(BusinessException);
  await expect(promise).rejects.toMatchObject({
    definition: TodosErrors.TODO_NOT_FOUND,
  });
}

describe('UpdateTodoUseCase', () => {
  it('성공: 보낸 필드만 바꾸고 수정된 할 일을 돌려준다', async () => {
    const store = fakeStore({
      update: jest.fn().mockResolvedValue({ ...TODO, title: '새 제목' }),
    });

    const res = await new UpdateTodoUseCase(store).execute(USER, TODO_ID, {
      title: '새 제목',
    });

    expect(res).toMatchObject({ title: '새 제목' });
    expect(store.update).toHaveBeenCalledWith(USER, TODO_ID, {
      title: '새 제목',
    });
  });

  it('title · dueDate 둘 다 없으면 VALIDATION_FAILED, 저장소를 부르지 않는다', async () => {
    const store = fakeStore();

    const result = new UpdateTodoUseCase(store).execute(USER, TODO_ID, {});

    await expect(result).rejects.toMatchObject({
      definition: CommonErrors.VALIDATION_FAILED,
    });
    expect(store.update).not.toHaveBeenCalled();
  });

  it('NOT_FOUND: 없거나 · 타인 소유 · 소프트 삭제면 TODO_NOT_FOUND', async () => {
    const store = fakeStore({ update: jest.fn().mockResolvedValue(null) });

    await expectNotFound(
      new UpdateTodoUseCase(store).execute(USER, TODO_ID, {
        dueDate: '2026-11-18',
      }),
    );
  });

  it('권한: Bearer 사용자 ID 를 조건으로 넘긴다', async () => {
    const store = fakeStore({ update: jest.fn().mockResolvedValue(TODO) });

    await new UpdateTodoUseCase(store).execute('fake-bearer-user', TODO_ID, {
      title: 'x',
    });

    expect((store.update.mock.calls[0] as unknown[])[0]).toBe(
      'fake-bearer-user',
    );
  });

  it('저장 실패: 그대로 전파한다', async () => {
    const store = fakeStore({ update: jest.fn().mockRejectedValue(DB_DOWN) });

    await expect(
      new UpdateTodoUseCase(store).execute(USER, TODO_ID, { title: 'x' }),
    ).rejects.toBe(DB_DOWN);
  });
});
