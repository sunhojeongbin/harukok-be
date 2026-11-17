import type { TodoRecord } from '../repositories/todos.store';
import type { TodoResponseDto } from './todo.dto';

export function toTodoResponse(todo: TodoRecord): TodoResponseDto {
  return {
    id: todo.id,
    title: todo.title,
    dueDate: todo.dueDate,
    completedAt: todo.completedAt?.toISOString() ?? null,
    createdAt: todo.createdAt.toISOString(),
  };
}
