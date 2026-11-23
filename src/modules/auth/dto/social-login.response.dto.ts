import { ApiProperty } from '@nestjs/swagger';
import {
  SOCIAL_PROVIDERS,
  type SocialProvider,
} from '../social/social-identity';

export class LoginUserDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: '없으면 NULL (화면 기본 문구는 앱이 정함)',
  })
  name: string | null;

  @ApiProperty({
    enum: SOCIAL_PROVIDERS,
    description: '가입한 소셜 제공자. 계정 연동이 없어 사용자당 하나',
  })
  provider: SocialProvider;
}

export class SocialLoginResponseDto {
  @ApiProperty({ description: 'JWT. 1시간' })
  accessToken: string;

  @ApiProperty({ description: '30일. 재발급·로그아웃 요청 본문에 보낸다' })
  refreshToken: string;

  @ApiProperty()
  isNewUser: boolean;

  @ApiProperty({ type: LoginUserDto })
  user: LoginUserDto;
}
