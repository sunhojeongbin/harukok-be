import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsString } from 'class-validator';
import { StripHtml } from '../../../common/text/strip-html';
import { IsDateOnly } from '../../../common/validation/date-only';
import { TextLength } from '../../../common/validation/text-length';

const TITLE_DOC = {
  minLength: 1,
  maxLength: 250,
  description: 'HTML 은 제거된다. 앞뒤 공백 제외 1~250자, 공백만은 거부',
};
const DUE_DATE_DOC = {
  example: '2026-11-17',
  description: 'YYYY-MM-DD (시각 · 타임존 포함 거부)',
};

export class ListTodosQueryDto {
  @ApiProperty(DUE_DATE_DOC)
  @IsDateOnly()
  date: string;
}

export class CreateTodoDto {
  @ApiProperty(TITLE_DOC)
  @StripHtml()
  @IsString()
  @TextLength(1, 250)
  title: string;

  @ApiProperty(DUE_DATE_DOC)
  @IsDateOnly()
  dueDate: string;
}

/**
 * 제목만 수정한다 — 날짜는 수정 대상이 아니다 (API 설계서 4장 9번, 2026-11-26 변경).
 * dueDate 필드를 두지 않으므로 보내면 전역 ValidationPipe(forbidNonWhitelisted)가 400 으로 거부한다
 */
export class UpdateTodoDto {
  @ApiProperty(TITLE_DOC)
  @StripHtml()
  @IsString()
  @TextLength(1, 250)
  title: string;
}

export class ChangeCompletionDto {
  @ApiProperty({
    description: 'true → 완료(처음 완료 시각 유지), false → 미완료',
  })
  @IsBoolean()
  completed: boolean;
}

export class TodoResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ example: '2026-11-17' })
  dueDate: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'NULL 이면 미완료',
  })
  completedAt: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;
}

export class CompletionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  completedAt: string | null;
}

/** 기간 검증(startDate ≤ endDate, 최대 42일)은 GetTodoStatsUseCase 가 한다 */
export class TodoStatsQueryDto {
  @ApiProperty({ ...DUE_DATE_DOC, example: '2026-11-22' })
  @IsDateOnly()
  startDate: string;

  @ApiProperty({
    ...DUE_DATE_DOC,
    example: '2026-11-28',
    description: 'YYYY-MM-DD. startDate 이상, 양 끝 포함 최대 42일',
  })
  @IsDateOnly()
  endDate: string;
}

export class TodoStatsCountDto {
  @ApiProperty({ example: 5 })
  totalCount: number;

  @ApiProperty({ example: 3 })
  completedCount: number;
}

export class TodoStatsDayDto extends TodoStatsCountDto {
  @ApiProperty({ example: '2026-11-22' })
  date: string;
}

export class TodoStatsResponseDto {
  @ApiProperty({ example: '2026-11-22' })
  startDate: string;

  @ApiProperty({ example: '2026-11-28' })
  endDate: string;

  @ApiProperty({ type: TodoStatsCountDto, description: 'days 합계' })
  summary: TodoStatsCountDto;

  @ApiProperty({
    type: [TodoStatsDayDto],
    description: '범위의 모든 날짜 오름차순. 할 일이 없는 날도 0 · 0',
  })
  days: TodoStatsDayDto[];
}
