import { ApiProperty } from '@nestjs/swagger';

export class TermResponseDto {
  @ApiProperty({
    format: 'uuid',
    description: '현행 이용약관 ID (가입 시 서버가 이 약관에 자동 동의로 기록)',
  })
  id: string;

  @ApiProperty({
    example: '1.0',
    description: '현행 이용약관 버전',
  })
  version: string;

  @ApiProperty({
    example: 'https://example.com/terms',
    description: '본문 공개 페이지 (WebView)',
  })
  contentUrl: string;
}
