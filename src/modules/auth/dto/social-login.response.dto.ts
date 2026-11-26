import { ApiProperty } from '@nestjs/swagger';
import {
  SOCIAL_PROVIDERS,
  type SocialProvider,
} from '../social/social-identity';

export class LoginUserDto {
  @ApiProperty({ format: 'uuid', description: '사용자 ID' })
  id: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: '소셜 계정에서 받은 이름. 없으면 NULL',
  })
  name: string | null;

  @ApiProperty({
    enum: SOCIAL_PROVIDERS,
    description: '가입한 소셜 제공자. 계정 연동이 없어 사용자당 하나',
  })
  provider: SocialProvider;
}

export class SocialLoginResponseDto {
  @ApiProperty({
    description: 'API 호출용 토큰. Authorization: Bearer 헤더에 넣는다 (1시간)',
  })
  accessToken: string;

  @ApiProperty({ description: '30일. 재발급·로그아웃 요청 본문에 보낸다' })
  refreshToken: string;

  @ApiProperty({ description: '이번 요청으로 새로 가입했으면 true' })
  isNewUser: boolean;

  @ApiProperty({ type: LoginUserDto, description: '로그인한 사용자 정보' })
  user: LoginUserDto;
}
