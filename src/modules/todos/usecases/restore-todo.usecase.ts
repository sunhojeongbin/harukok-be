import { Inject, Injectable } from '@nestjs/common';
import { BusinessException } from '../../../common/errors/business.exception';
import type { TodoResponseDto } from '../dto/todo.dto';
import { toTodoResponse } from '../dto/todo.mapper';
import { TodosErrors } from '../errors/todos.errors';
import { TODOS_STORE, type TodosStore } from '../repositories/todos.store';

/** POST /todos/{todoId}/restore — API 설계서 4장 12번. 멱등, 하드 삭제됐으면 404 */
@Injectable()
export class RestoreTodoUseCase {
  constructor(@Inject(TODOS_STORE) private readonly store: TodosStore) {}

  async execute(userId: string, todoId: string): Promise<TodoResponseDto> {
    const todo = await this.store.restore(userId, todoId);
    if (!todo) throw new BusinessException(TodosErrors.TODO_NOT_FOUND);
    return toTodoResponse(todo);
  }
}
