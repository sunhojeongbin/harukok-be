// ListTodosUseCase — 성공 / NOT_FOUND / 권한 / 저장 실패 (CLAUDE.md 5장)
import {
  fakeStore,
  TODO,
  TODO_RESPONSE,
  USER,
} from '../../../../test/fixtures/fake-todos-store';
import { ListTodosUseCase } from './list-todos.usecase';

const DB_DOWN = new Error('fake db down');

describe('ListTodosUseCase', () => {
  it('성공: 그 날짜의 할 일을 응답 형식으로 (순서는 저장소 ORDER BY id 그대로)', async () => {
    const second = { ...TODO, id: '00000000-0000-7000-8000-0000000000b2' };
    const store = fakeStore({
      list: jest.fn().mockResolvedValue([TODO, second]),
    });

    const res = await new ListTodosUseCase(store).execute(USER, '2026-11-17');

    expect(res).toEqual([TODO_RESPONSE, { ...TODO_RESPONSE, id: second.id }]);
  });

  it('NOT_FOUND 계열: 할 일이 없으면 404 가 아니라 빈 배열', async () => {
    const store = fakeStore({ list: jest.fn().mockResolvedValue([]) });

    await expect(
      new ListTodosUseCase(store).execute(USER, '2026-11-17'),
    ).resolves.toEqual([]);
  });

  it('권한: Bearer 사용자 ID 와 날짜로만 조회한다', async () => {
    const store = fakeStore({ list: jest.fn().mockResolvedValue([]) });

    await new ListTodosUseCase(store).execute('fake-bearer-user', '2026-11-17');

    expect(store.list).toHaveBeenCalledWith('fake-bearer-user', '2026-11-17');
  });

  it('저장 실패: 그대로 전파한다', async () => {
    const store = fakeStore({ list: jest.fn().mockRejectedValue(DB_DOWN) });

    await expect(
      new ListTodosUseCase(store).execute(USER, '2026-11-17'),
    ).rejects.toBe(DB_DOWN);
  });
});
