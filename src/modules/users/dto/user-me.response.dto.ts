import { ApiProperty } from '@nestjs/swagger';
import {
  SOCIAL_PROVIDERS,
  type SocialProvider,
} from '../../auth/social/social-identity';

export class UserMeResponseDto {
  @ApiProperty({ format: 'uuid', description: '사용자 ID' })
  id: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: '소셜 계정에서 받은 이름. 없으면 NULL',
  })
  name: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: '소셜 계정에서 받은 이메일(소문자). 없으면 NULL',
  })
  email: string | null;

  @ApiProperty({
    enum: SOCIAL_PROVIDERS,
    description:
      '설정 화면 "로그인 제공자 표시". 계정 연동이 없어 사용자당 하나',
  })
  provider: SocialProvider;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: '가입한 시각 (ISO 8601)',
  })
  createdAt: string;
}
