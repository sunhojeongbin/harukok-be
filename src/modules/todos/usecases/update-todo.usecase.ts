import { Inject, Injectable } from '@nestjs/common';
import { BusinessException } from '../../../common/errors/business.exception';
import type { TodoResponseDto, UpdateTodoDto } from '../dto/todo.dto';
import { toTodoResponse } from '../dto/todo.mapper';
import { TodosErrors } from '../errors/todos.errors';
import { TODOS_STORE, type TodosStore } from '../repositories/todos.store';

/** PATCH /todos/{todoId} — API 설계서 4장 9번. 제목만 수정(날짜 불가), 없음 · 타인 · 삭제됨은 404 */
@Injectable()
export class UpdateTodoUseCase {
  constructor(@Inject(TODOS_STORE) private readonly store: TodosStore) {}

  async execute(
    userId: string,
    todoId: string,
    body: UpdateTodoDto,
  ): Promise<TodoResponseDto> {
    const todo = await this.store.update(userId, todoId, body.title);
    if (!todo) throw new BusinessException(TodosErrors.TODO_NOT_FOUND);
    return toTodoResponse(todo);
  }
}
