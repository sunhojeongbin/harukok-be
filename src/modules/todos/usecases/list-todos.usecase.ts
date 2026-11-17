import { Inject, Injectable } from '@nestjs/common';
import type { TodoResponseDto } from '../dto/todo.dto';
import { toTodoResponse } from '../dto/todo.mapper';
import { TODOS_STORE, type TodosStore } from '../repositories/todos.store';

/** GET /todos?date= — API 설계서 4장 7번. 없으면 404 가 아니라 빈 배열 */
@Injectable()
export class ListTodosUseCase {
  constructor(@Inject(TODOS_STORE) private readonly store: TodosStore) {}

  async execute(userId: string, date: string): Promise<TodoResponseDto[]> {
    return (await this.store.list(userId, date)).map(toTodoResponse);
  }
}
