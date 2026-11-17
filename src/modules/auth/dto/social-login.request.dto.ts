import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { StripHtml } from '../../../common/text/strip-html';
import {
  SOCIAL_PROVIDERS,
  type SocialProvider,
} from '../social/social-identity';

/** 약관 동의 필드는 두지 않는다 — 신규 가입 시 서버가 현행 이용약관에 자동 동의로 기록한다 (API 설계서 5-2 변경) */
export class SocialLoginRequestDto {
  @ApiProperty({ enum: SOCIAL_PROVIDERS })
  @IsIn(SOCIAL_PROVIDERS)
  provider: SocialProvider;

  @ApiProperty({
    description: '카카오·구글은 OIDC id_token, 애플은 identityToken',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(8192)
  idToken: string;

  @ApiPropertyOptional({
    description: '애플만 필수. 5분 만료 · 단일 사용 — 이 요청에서 즉시 교환',
  })
  @ValidateIf((o: SocialLoginRequestDto) => o.provider === 'APPLE')
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  authorizationCode?: string;

  @ApiPropertyOptional({
    description:
      '애플 최초 가입에서만. 카카오·구글은 무시. HTML 제거 후 50자 절삭',
  })
  @IsOptional()
  @StripHtml()
  @IsString()
  @MaxLength(500)
  name?: string;

  @ApiProperty({ maxLength: 128, description: '클라이언트가 만든 기기 식별자' })
  @IsString()
  @Matches(/\S/, { message: 'deviceId must not be blank' })
  @MaxLength(128)
  deviceId: string;
}
