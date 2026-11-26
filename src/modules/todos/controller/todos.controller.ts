import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AccessTokenGuard,
  CurrentUserId,
} from '../../../common/auth/access-token.guard';
import { ErrorBodyDto } from '../../../common/swagger/error-body.dto';
import {
  ChangeCompletionDto,
  CompletionResponseDto,
  CreateTodoDto,
  ListTodosQueryDto,
  TodoResponseDto,
  TodoStatsDayDto,
  TodoStatsQueryDto,
  UpdateTodoDto,
} from '../dto/todo.dto';
import { ChangeCompletionUseCase } from '../usecases/change-completion.usecase';
import { CreateTodoUseCase } from '../usecases/create-todo.usecase';
import { DeleteTodoUseCase } from '../usecases/delete-todo.usecase';
import { GetTodoStatsUseCase } from '../usecases/get-todo-stats.usecase';
import { ListTodosUseCase } from '../usecases/list-todos.usecase';
import { RestoreTodoUseCase } from '../usecases/restore-todo.usecase';
import { UpdateTodoUseCase } from '../usecases/update-todo.usecase';
import { TodoIdPipe } from './todo-id.pipe';

const NOT_FOUND = {
  type: ErrorBodyDto,
  description: 'TODO_NOT_FOUND — 없음 · 타인 소유 · 소프트 삭제 (403 아님)',
};

const TODO_ID_PARAM = {
  name: 'todoId',
  format: 'uuid',
  description: '대상 할 일 ID. 없거나 남의 것이면 404',
};

@ApiTags('todos')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@ApiUnauthorizedResponse({
  type: ErrorBodyDto,
  description: 'ACCESS_TOKEN_INVALID',
})
@Controller('todos')
export class TodosController {
  constructor(
    private readonly listTodos: ListTodosUseCase,
    private readonly createTodo: CreateTodoUseCase,
    private readonly updateTodo: UpdateTodoUseCase,
    private readonly changeCompletion: ChangeCompletionUseCase,
    private readonly deleteTodo: DeleteTodoUseCase,
    private readonly restoreTodo: RestoreTodoUseCase,
    private readonly todoStats: GetTodoStatsUseCase,
  ) {}

  // ':todoId' 경로보다 먼저 둔다 — v1 에는 GET /todos/{todoId} 가 없지만 v1.1 에서 생겨도 충돌하지 않게 (API 설계서 4장 13번)
  @Get('stats')
  @ApiOperation({
    summary: '홈 달력 날짜별 할 일 개수 · 완료 개수 (주간 · 월간 공용)',
    description:
      '앱이 화면에 보이는 첫날 ~ 마지막날을 보낸다. 범위의 모든 날짜를 오름차순 배열로, 할 일이 없는 날도 0 · 0',
  })
  @ApiOkResponse({
    type: [TodoStatsDayDto],
    // 배열 예시는 기본으로 1개만 보인다 — 날짜 3개(할 일 없는 날 포함)로 보여 준다
    example: [
      { date: '2026-11-22', totalCount: 2, completedCount: 1 },
      { date: '2026-11-23', totalCount: 0, completedCount: 0 },
      { date: '2026-11-24', totalCount: 3, completedCount: 3 },
    ],
  })
  @ApiBadRequestResponse({
    type: ErrorBodyDto,
    description:
      'VALIDATION_FAILED — 날짜 형식(YYYY-MM-DD) · startDate > endDate · 42일 초과',
  })
  stats(
    @CurrentUserId() userId: string,
    @Query() query: TodoStatsQueryDto,
  ): Promise<TodoStatsDayDto[]> {
    return this.todoStats.execute(userId, query);
  }

  @Get()
  @ApiOperation({
    summary: '날짜별 목록',
    description:
      '완료 · 미완료 포함, 생성순(ORDER BY id). 삭제한 할 일은 빠진다',
  })
  @ApiOkResponse({ type: [TodoResponseDto] })
  @ApiBadRequestResponse({
    type: ErrorBodyDto,
    description: 'VALIDATION_FAILED — date 형식',
  })
  list(
    @CurrentUserId() userId: string,
    @Query() query: ListTodosQueryDto,
  ): Promise<TodoResponseDto[]> {
    return this.listTodos.execute(userId, query.date);
  }

  @Post()
  @ApiOperation({ summary: '등록' })
  @ApiCreatedResponse({ type: TodoResponseDto })
  @ApiBadRequestResponse({
    type: ErrorBodyDto,
    description: 'VALIDATION_FAILED',
  })
  create(
    @CurrentUserId() userId: string,
    @Body() body: CreateTodoDto,
  ): Promise<TodoResponseDto> {
    return this.createTodo.execute(userId, body);
  }

  @Patch(':todoId')
  @ApiOperation({
    summary: '제목 수정',
    description:
      '날짜(dueDate)는 수정할 수 없다 — 보내면 400. title 검증은 등록과 같다',
  })
  @ApiOkResponse({ type: TodoResponseDto })
  @ApiBadRequestResponse({
    type: ErrorBodyDto,
    description: 'VALIDATION_FAILED',
  })
  @ApiParam(TODO_ID_PARAM)
  @ApiNotFoundResponse(NOT_FOUND)
  update(
    @CurrentUserId() userId: string,
    @Param('todoId', TodoIdPipe) todoId: string,
    @Body() body: UpdateTodoDto,
  ): Promise<TodoResponseDto> {
    return this.updateTodo.execute(userId, todoId, body);
  }

  @Patch(':todoId/completion')
  @ApiOperation({
    summary: '완료 상태 변경',
    description:
      '멱등. 완료 시각은 서버가 찍고, 이미 완료면 처음 시각을 유지한다',
  })
  @ApiOkResponse({ type: CompletionResponseDto })
  @ApiBadRequestResponse({
    type: ErrorBodyDto,
    description: 'VALIDATION_FAILED',
  })
  @ApiParam(TODO_ID_PARAM)
  @ApiNotFoundResponse(NOT_FOUND)
  completion(
    @CurrentUserId() userId: string,
    @Param('todoId', TodoIdPipe) todoId: string,
    @Body() body: ChangeCompletionDto,
  ): Promise<CompletionResponseDto> {
    return this.changeCompletion.execute(userId, todoId, body);
  }

  @Delete(':todoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: '삭제 (소프트)',
    description:
      '7일 보존 후 정리 배치가 하드 삭제. 멱등 — 이미 삭제한 내 할 일도 204',
  })
  @ApiNoContentResponse({ description: '삭제됨' })
  @ApiParam(TODO_ID_PARAM)
  @ApiNotFoundResponse(NOT_FOUND)
  remove(
    @CurrentUserId() userId: string,
    @Param('todoId', TodoIdPipe) todoId: string,
  ): Promise<void> {
    return this.deleteTodo.execute(userId, todoId);
  }

  @Post(':todoId/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '삭제 되돌리기',
    description:
      '같은 행을 되살려 목록 위치가 유지된다. 멱등 — 이미 살아 있으면 그대로 200',
  })
  @ApiOkResponse({ type: TodoResponseDto })
  @ApiParam(TODO_ID_PARAM)
  @ApiNotFoundResponse(NOT_FOUND)
  restore(
    @CurrentUserId() userId: string,
    @Param('todoId', TodoIdPipe) todoId: string,
  ): Promise<TodoResponseDto> {
    return this.restoreTodo.execute(userId, todoId);
  }
}
