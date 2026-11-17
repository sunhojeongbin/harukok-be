import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorBodyDto } from '../../../common/swagger/error-body.dto';
import { SocialLoginRequestDto } from '../dto/social-login.request.dto';
import { SocialLoginResponseDto } from '../dto/social-login.response.dto';
import { SocialLoginUseCase } from '../usecases/social-login.usecase';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly socialLogin: SocialLoginUseCase) {}

  @Post('social/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '소셜 가입·로그인',
    description:
      '카카오·애플·구글 통합. 신규 가입은 현행 이용약관 동의(agreement) 필수. 기기당 세션 1개, 최대 3대 (초과 시 가장 오래된 기기 자동 폐기). 인증 없음',
  })
  @ApiOkResponse({ type: SocialLoginResponseDto })
  @ApiBadRequestResponse({
    type: ErrorBodyDto,
    description: 'VALIDATION_FAILED · TERMS_AGREEMENT_REQUIRED',
  })
  @ApiUnauthorizedResponse({
    type: ErrorBodyDto,
    description: 'SOCIAL_TOKEN_INVALID',
  })
  login(@Body() body: SocialLoginRequestDto): Promise<SocialLoginResponseDto> {
    return this.socialLogin.execute(body);
  }
}
