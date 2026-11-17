import { Inject, Injectable } from '@nestjs/common';
import type { CreateTodoDto, TodoResponseDto } from '../dto/todo.dto';
import { toTodoResponse } from '../dto/todo.mapper';
import { TODOS_STORE, type TodosStore } from '../repositories/todos.store';

/** POST /todos — API 설계서 4장 8번. title 은 DTO 에서 HTML 제거 · 길이 검증을 마쳤다 */
@Injectable()
export class CreateTodoUseCase {
  constructor(@Inject(TODOS_STORE) private readonly store: TodosStore) {}

  async execute(userId: string, body: CreateTodoDto): Promise<TodoResponseDto> {
    return toTodoResponse(
      await this.store.create(userId, body.title, body.dueDate),
    );
  }
}
