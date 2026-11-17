import { BusinessException } from '../../../common/errors/business.exception';
import { TodosErrors } from '../errors/todos.errors';
import { TodoIdPipe } from './todo-id.pipe';

describe('TodoIdPipe', () => {
  const pipe = new TodoIdPipe();

  it('UUID 면 그대로 통과', () => {
    const id = '01a1e82f-4dcb-709f-8200-6bf8e41edc0f';

    expect(pipe.transform(id)).toBe(id);
  });

  it.each(['not-a-uuid', '123', '', "1' OR '1'='1"])(
    'UUID 가 아니면(%j) TODO_NOT_FOUND — 존재하지 않는 것과 구분하지 않는다',
    (value) => {
      let error: unknown;
      try {
        pipe.transform(value);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(BusinessException);
      expect(error).toMatchObject({ definition: TodosErrors.TODO_NOT_FOUND });
    },
  );
});
