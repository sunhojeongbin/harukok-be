// UpdateTodoUseCase — 성공 / NOT_FOUND / 권한 / 저장 실패 (CLAUDE.md 5장)
import { BusinessException } from '../../../common/errors/business.exception';
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
  it('성공: 제목을 바꾸고 수정된 할 일을 돌려준다', async () => {
    const store = fakeStore({
      update: jest.fn().mockResolvedValue({ ...TODO, title: '새 제목' }),
    });

    const res = await new UpdateTodoUseCase(store).execute(USER, TODO_ID, {
      title: '새 제목',
    });

    expect(res).toMatchObject({ title: '새 제목' });
    expect(store.update).toHaveBeenCalledWith(USER, TODO_ID, '새 제목');
  });

  // 2026-11-26 명세 변경: 날짜는 수정 대상이 아니다 — 저장소에 제목만 넘긴다
  it('날짜는 바꾸지 않는다: 저장소에는 제목만 넘긴다', async () => {
    const store = fakeStore({ update: jest.fn().mockResolvedValue(TODO) });

    await new UpdateTodoUseCase(store).execute(USER, TODO_ID, { title: 'x' });

    expect(store.update.mock.calls[0]).toEqual([USER, TODO_ID, 'x']);
  });

  it('NOT_FOUND: 없거나 · 타인 소유 · 소프트 삭제면 TODO_NOT_FOUND', async () => {
    const store = fakeStore({ update: jest.fn().mockResolvedValue(null) });

    await expectNotFound(
      new UpdateTodoUseCase(store).execute(USER, TODO_ID, { title: 'x' }),
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
