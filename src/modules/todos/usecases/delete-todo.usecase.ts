import { Inject, Injectable } from '@nestjs/common';
import { BusinessException } from '../../../common/errors/business.exception';
import { TodosErrors } from '../errors/todos.errors';
import { TODOS_STORE, type TodosStore } from '../repositories/todos.store';

/** DELETE /todos/{todoId} — API 설계서 4장 11번. 소프트 삭제, 이미 삭제한 내 할 일은 그대로 204 (멱등) */
@Injectable()
export class DeleteTodoUseCase {
  constructor(@Inject(TODOS_STORE) private readonly store: TodosStore) {}

  async execute(userId: string, todoId: string): Promise<void> {
    if ((await this.store.softDelete(userId, todoId)) === 'NOT_FOUND') {
      throw new BusinessException(TodosErrors.TODO_NOT_FOUND);
    }
  }
}
