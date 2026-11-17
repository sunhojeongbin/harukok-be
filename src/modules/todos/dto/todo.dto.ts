import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
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

/** 둘 다 없으면 400 — UpdateTodoUseCase 가 검사한다 */
export class UpdateTodoDto {
  @ApiPropertyOptional(TITLE_DOC)
  @IsOptional()
  @StripHtml()
  @IsString()
  @TextLength(1, 250)
  title?: string;

  @ApiPropertyOptional(DUE_DATE_DOC)
  @IsOptional()
  @IsDateOnly()
  dueDate?: string;
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
