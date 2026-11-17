import { toTodoResponse } from './todo.mapper';

describe('toTodoResponse', () => {
  it('dueDate 는 문자열 그대로, 시각은 ISO 로 바꾼다', () => {
    expect(
      toTodoResponse({
        id: 'fake-id',
        title: '가짜',
        dueDate: '2026-11-17',
        completedAt: new Date('2026-11-17T02:00:00.000Z'),
        createdAt: new Date('2026-11-17T01:00:00.000Z'),
      }),
    ).toEqual({
      id: 'fake-id',
      title: '가짜',
      dueDate: '2026-11-17',
      completedAt: '2026-11-17T02:00:00.000Z',
      createdAt: '2026-11-17T01:00:00.000Z',
    });
  });

  it('미완료면 completedAt: null', () => {
    expect(
      toTodoResponse({
        id: 'fake-id',
        title: '가짜',
        dueDate: '2026-11-17',
        completedAt: null,
        createdAt: new Date('2026-11-17T01:00:00.000Z'),
      }).completedAt,
    ).toBeNull();
  });
});
