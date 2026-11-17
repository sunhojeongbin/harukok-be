// 할 일 UseCase 단위 테스트 공용 — 저장소 가짜 구현과 공통 값 (test/ 아래라 빌드에 섞이지 않는다)
import type {
  TodoRecord,
  TodosStore,
} from '../../src/modules/todos/repositories/todos.store';

export const USER = '00000000-0000-7000-8000-0000000000a1';
export const TODO_ID = '00000000-0000-7000-8000-0000000000b1';

export const TODO: TodoRecord = {
  id: TODO_ID,
  title: '가짜 할 일',
  dueDate: '2026-11-17',
  completedAt: null,
  createdAt: new Date('2026-11-17T01:00:00.000Z'),
};

export const TODO_RESPONSE = {
  id: TODO_ID,
  title: '가짜 할 일',
  dueDate: '2026-11-17',
  completedAt: null,
  createdAt: '2026-11-17T01:00:00.000Z',
};

export type FakeTodosStore = Record<keyof TodosStore, jest.Mock>;

/** jest.Mock 은 TodosStore 메서드 자리에 그대로 들어간다 */
export function fakeStore(
  overrides: Partial<FakeTodosStore> = {},
): FakeTodosStore {
  return {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    setCompleted: jest.fn(),
    softDelete: jest.fn(),
    restore: jest.fn(),
    ...overrides,
  };
}
