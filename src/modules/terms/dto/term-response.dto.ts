import { ApiProperty } from '@nestjs/swagger';

export class TermResponseDto {
  @ApiProperty({
    format: 'uuid',
    description: '동의 시 agreement.termId 로 보낸다',
  })
  id: string;

  @ApiProperty({
    example: '1.0',
    description: '동의 시 agreement.version 으로 보낸다',
  })
  version: string;

  @ApiProperty({
    example: 'https://example.com/terms',
    description: '본문 공개 페이지 (WebView)',
  })
  contentUrl: string;
}
