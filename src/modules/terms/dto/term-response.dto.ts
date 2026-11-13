import { ApiProperty } from '@nestjs/swagger';
import { TERM_TYPES, type TermType } from '../entities/term.entity';

export class TermResponseDto {
  @ApiProperty({
    format: 'uuid',
    description: '동의 시 agreements[].termId 로 보낸다',
  })
  id: string;

  @ApiProperty({ enum: TERM_TYPES })
  type: TermType;

  @ApiProperty({
    example: '1.0',
    description: '동의 시 agreements[].version 으로 보낸다',
  })
  version: string;

  @ApiProperty({ description: '필수 동의 여부' })
  required: boolean;

  @ApiProperty({
    example: 'https://example.com/terms',
    description: '본문 공개 페이지 (WebView)',
  })
  contentUrl: string;
}
