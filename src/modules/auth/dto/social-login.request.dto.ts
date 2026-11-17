import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { StripHtml } from '../../../common/text/strip-html';
import {
  SOCIAL_PROVIDERS,
  type SocialProvider,
} from '../social/social-identity';

export class AgreementDto {
  @ApiProperty({ format: 'uuid', description: 'GET /terms 의 id' })
  @IsUUID()
  termId: string;

  @ApiProperty({ example: '1.0', description: 'GET /terms 의 version' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  version: string;
}

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

  @ApiPropertyOptional({
    type: AgreementDto,
    description: '신규 가입이면 필수 (현행 이용약관)',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AgreementDto)
  agreement?: AgreementDto;
}
