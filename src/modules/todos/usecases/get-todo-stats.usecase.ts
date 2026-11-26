import { Inject, Injectable } from '@nestjs/common';
import { BusinessException } from '../../../common/errors/business.exception';
import { CommonErrors } from '../../../common/errors/common.errors';
import type {
  TodoStatsDayResponseDto,
  TodoStatsQueryDto,
} from '../dto/todo.dto';
import { TODOS_STORE, type TodosStore } from '../repositories/todos.store';

/** 월간 6주 그리드 — 화면에 필요한 최대 범위 (API 설계서 5-7) */
export const MAX_STATS_DAYS = 42;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' 두 날짜의 양 끝 포함 일수. 형식은 DTO 가 이미 검증했다 */
function inclusiveDays(startDate: string, endDate: string): number {
  return (Date.parse(endDate) - Date.parse(startDate)) / DAY_MS + 1;
}

/**
 * GET /todos/stats — API 설계서 4장 13번. 홈 달력(주간 · 월간)의 날짜별 개수.
 * 범위의 모든 날짜 오름차순 배열만 돌려준다(기간 · 합계 없음). startDate > endDate 또는 42일 초과는 400
 */
@Injectable()
export class GetTodoStatsUseCase {
  constructor(@Inject(TODOS_STORE) private readonly store: TodosStore) {}

  async execute(
    userId: string,
    { startDate, endDate }: TodoStatsQueryDto,
  ): Promise<TodoStatsDayResponseDto[]> {
    const days = inclusiveDays(startDate, endDate);
    if (days < 1 || days > MAX_STATS_DAYS) {
      throw new BusinessException(CommonErrors.VALIDATION_FAILED);
    }
    return this.store.countByDate(userId, startDate, endDate);
  }
}
