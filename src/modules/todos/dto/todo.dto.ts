import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsString } from 'class-validator';
import { StripHtml } from '../../../common/text/strip-html';
import { IsDateOnly } from '../../../common/validation/date-only';
import { TextLength } from '../../../common/validation/text-length';

// 공용 설정에는 규칙(길이 · 형식 · 예시)만 둔다. 설명은 필드마다 그 값이 무엇인지 한 줄로 쓴다
const TITLE_DOC = {
  minLength: 1,
  maxLength: 250,
  example: '장보기',
  description: '할 일 제목(HTML 제거 후 1~250자, 공백 거부)',
};
const DATE_FORMAT = { example: '2026-11-17', format: 'date' } as const;

export class ListTodosQueryDto {
  @ApiProperty({ ...DATE_FORMAT, description: '할 일 목록 조회 날짜' })
  @IsDateOnly()
  date: string;
}

export class CreateTodoDto {
  @ApiProperty(TITLE_DOC)
  @StripHtml()
  @IsString()
  @TextLength(1, 250)
  title: string;

  @ApiProperty({ ...DATE_FORMAT, description: '할 일 등록 날짜' })
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
  @ApiProperty({ format: 'uuid', description: '할 일 ID' })
  id: string;

  @ApiProperty({
    example: '장보기',
    description: '할 일 제목 (HTML 제거된 값)',
  })
  title: string;

  @ApiProperty({ ...DATE_FORMAT, description: '할 일 등록 날짜' })
  dueDate: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: '완료한 시각 (서버 시각). NULL 이면 미완료',
  })
  completedAt: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: '등록한 시각 (서버 시각, ISO 8601)',
  })
  createdAt: string;
}

export class CompletionResponseDto {
  @ApiProperty({ format: 'uuid', description: '완료 상태를 바꾼 할 일 ID' })
  id: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: '완료한 시각. NULL 이면 미완료',
  })
  completedAt: string | null;
}

/** 기간 검증(startDate ≤ endDate, 최대 42일)은 GetTodoStatsUseCase 가 한다 */
export class TodoStatsQueryDto {
  @ApiProperty({
    ...DATE_FORMAT,
    example: '2026-11-22',
    description: '할 일 조회 시작 날짜(YYYY-MM-DD)',
  })
  @IsDateOnly()
  startDate: string;

  @ApiProperty({
    ...DATE_FORMAT,
    example: '2026-11-28',
    description: '할 일 조회 마지막 날짜(YYYY-MM-DD)',
  })
  @IsDateOnly()
  endDate: string;
}

/** 날짜별 개수 — GET /todos/stats 는 이 배열만 내려준다 (감싸는 객체 · 기간 · 합계 없음) */
export class TodoStatsDayDto {
  @ApiProperty({
    ...DATE_FORMAT,
    example: '2026-11-22',
    description: '집계한 날짜 (YYYY-MM-DD)',
  })
  date: string;

  @ApiProperty({
    example: 2,
    description: '그날의 할 일 개수 (삭제한 것 제외)',
  })
  totalCount: number;

  @ApiProperty({ example: 1, description: '그날 완료한 할 일 개수' })
  completedCount: number;
}
