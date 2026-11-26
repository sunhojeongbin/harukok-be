import { Module } from '@nestjs/common';
import { TodosController } from './controller/todos.controller';
import { PgTodosStore, TODOS_STORE } from './repositories/todos.store';
import { ChangeCompletionUseCase } from './usecases/change-completion.usecase';
import { CreateTodoUseCase } from './usecases/create-todo.usecase';
import { DeleteTodoUseCase } from './usecases/delete-todo.usecase';
import { GetTodoStatsUseCase } from './usecases/get-todo-stats.usecase';
import { ListTodosUseCase } from './usecases/list-todos.usecase';
import { RestoreTodoUseCase } from './usecases/restore-todo.usecase';
import { UpdateTodoUseCase } from './usecases/update-todo.usecase';

@Module({
  controllers: [TodosController],
  providers: [
    ListTodosUseCase,
    CreateTodoUseCase,
    UpdateTodoUseCase,
    ChangeCompletionUseCase,
    DeleteTodoUseCase,
    RestoreTodoUseCase,
    GetTodoStatsUseCase,
    { provide: TODOS_STORE, useClass: PgTodosStore },
  ],
})
export class TodosModule {}
