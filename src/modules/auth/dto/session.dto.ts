import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { EXAMPLE } from './swagger-docs';

/** 재발급 · 로그아웃 공통 요청 (API 설계서 4장 2·3번, 6-1 — deviceId 3곳 모두 필수) */
export class SessionRequestDto {
  @ApiProperty({
    maxLength: 128,
    example: EXAMPLE.refreshToken,
    description: '로그인·재발급 응답의 refreshToken',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  refreshToken: string;

  @ApiProperty({
    maxLength: 128,
    example: EXAMPLE.deviceId,
    description: '로그인 때 보낸 것과 같은 기기 식별자 (공백만은 거부)',
  })
  @IsString()
  @Matches(/\S/, { message: 'deviceId must not be blank' })
  @MaxLength(128)
  deviceId: string;
}

export class RefreshTokenResponseDto {
  @ApiProperty({
    example: EXAMPLE.accessToken,
    description: 'API 호출용 토큰. Authorization: Bearer 헤더에 넣는다 (1시간)',
  })
  accessToken: string;

  @ApiProperty({
    example: EXAMPLE.refreshToken,
    description:
      '새 리프레시 토큰 (30일). 이전 토큰은 폐기된다 — 다시 쓰면 재사용으로 판정',
  })
  refreshToken: string;
}
