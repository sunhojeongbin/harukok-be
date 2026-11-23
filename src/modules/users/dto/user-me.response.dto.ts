import { ApiProperty } from '@nestjs/swagger';
import {
  SOCIAL_PROVIDERS,
  type SocialProvider,
} from '../../auth/social/social-identity';

export class UserMeResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: '없으면 NULL (애플 미제공 등). 화면 기본 문구는 앱이 정한다',
  })
  name: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: '없으면 NULL (애플 relay·미제공, 카카오 동의 거부)',
  })
  email: string | null;

  @ApiProperty({
    enum: SOCIAL_PROVIDERS,
    description:
      '설정 화면 "로그인 제공자 표시". 계정 연동이 없어 사용자당 하나',
  })
  provider: SocialProvider;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: string;
}
