import { Inject, Injectable } from '@nestjs/common';
import { BusinessException } from '../../../common/errors/business.exception';
import type {
  ChangeCompletionRequestDto,
  CompletionResponseDto,
} from '../dto/todo.dto';
import { TodosErrors } from '../errors/todos.errors';
import { TODOS_STORE, type TodosStore } from '../repositories/todos.store';

/** PATCH /todos/{todoId}/completion — API 설계서 4장 10번. 완료 시각은 서버 now(), 이미 완료면 처음 시각 유지 */
@Injectable()
export class ChangeCompletionUseCase {
  constructor(@Inject(TODOS_STORE) private readonly store: TodosStore) {}

  async execute(
    userId: string,
    todoId: string,
    body: ChangeCompletionRequestDto,
  ): Promise<CompletionResponseDto> {
    const result = await this.store.setCompleted(
      userId,
      todoId,
      body.completed,
    );
    if (!result) throw new BusinessException(TodosErrors.TODO_NOT_FOUND);
    return {
      id: result.id,
      completedAt: result.completedAt?.toISOString() ?? null,
    };
  }
}
