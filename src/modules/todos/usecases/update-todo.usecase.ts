import { Inject, Injectable } from '@nestjs/common';
import { BusinessException } from '../../../common/errors/business.exception';
import { CommonErrors } from '../../../common/errors/common.errors';
import type { TodoResponseDto, UpdateTodoDto } from '../dto/todo.dto';
import { toTodoResponse } from '../dto/todo.mapper';
import { TodosErrors } from '../errors/todos.errors';
import { TODOS_STORE, type TodosStore } from '../repositories/todos.store';

/** PATCH /todos/{todoId} — API 설계서 4장 9번. 둘 다 없으면 400, 없음 · 타인 · 삭제됨은 404 */
@Injectable()
export class UpdateTodoUseCase {
  constructor(@Inject(TODOS_STORE) private readonly store: TodosStore) {}

  async execute(
    userId: string,
    todoId: string,
    body: UpdateTodoDto,
  ): Promise<TodoResponseDto> {
    const changes: { title?: string; dueDate?: string } = {};
    if (body.title !== undefined) changes.title = body.title;
    if (body.dueDate !== undefined) changes.dueDate = body.dueDate;
    if (Object.keys(changes).length === 0) {
      throw new BusinessException(CommonErrors.VALIDATION_FAILED);
    }
    const todo = await this.store.update(userId, todoId, changes);
    if (!todo) throw new BusinessException(TodosErrors.TODO_NOT_FOUND);
    return toTodoResponse(todo);
  }
}
