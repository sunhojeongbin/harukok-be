import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AccessTokenGuard,
  CurrentUserId,
} from '../../../common/auth/access-token.guard';
import { ErrorResponseDto } from '../../../common/swagger/error-response.dto';
import { RefreshTokenResponseDto, SessionRequestDto } from '../dto/session.dto';
import { SocialLoginRequestDto } from '../dto/social-login.request.dto';
import { SocialLoginResponseDto } from '../dto/social-login.response.dto';
import { LogoutUseCase } from '../usecases/logout.usecase';
import { RefreshTokenUseCase } from '../usecases/refresh-token.usecase';
import { SocialLoginUseCase } from '../usecases/social-login.usecase';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly socialLogin: SocialLoginUseCase,
    private readonly refreshToken: RefreshTokenUseCase,
    private readonly logoutUseCase: LogoutUseCase,
  ) {}

  @Post('social/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '소셜 가입·로그인',
    description:
      '카카오·애플·구글 통합. 신규 가입 시 현행 이용약관에 자동 동의로 기록. 기기당 세션 1개, 최대 3대 (초과 시 가장 오래된 기기 자동 폐기). 인증 없음',
  })
  @ApiOkResponse({ type: SocialLoginResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'VALIDATION_FAILED',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'SOCIAL_TOKEN_INVALID',
  })
  login(@Body() body: SocialLoginRequestDto): Promise<SocialLoginResponseDto> {
    return this.socialLogin.execute(body);
  }

  @Post('token/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '액세스 토큰 재발급 + 로테이션',
    description:
      '스플래시 자동 로그인 판정 (성공 → 홈, 401 → 로그인). 이전 리프레시 토큰은 폐기되고, 폐기된 토큰을 다시 보내면 재사용으로 판정해 그 기기 세션을 폐기한다. 같은 토큰으로 동시에 두 번 보내지 말 것. 인증 없음',
  })
  @ApiOkResponse({ type: RefreshTokenResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'VALIDATION_FAILED',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description:
      'REFRESH_TOKEN_INVALID(없음·기기 불일치) · REFRESH_TOKEN_REVOKED(재사용) · REFRESH_TOKEN_EXPIRED',
  })
  refresh(@Body() body: SessionRequestDto): Promise<RefreshTokenResponseDto> {
    return this.refreshToken.execute(body);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AccessTokenGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '로그아웃 (현재 기기)',
    description:
      '해당 기기의 리프레시 토큰을 폐기한다 (행 삭제 아님). 멱등 — 이미 폐기·만료된 토큰도 204',
  })
  @ApiNoContentResponse({ description: '폐기됨' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'VALIDATION_FAILED',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description:
      'ACCESS_TOKEN_INVALID(Bearer) · REFRESH_TOKEN_INVALID(없음·다른 사용자·기기 불일치)',
  })
  logout(
    @CurrentUserId() userId: string,
    @Body() body: SessionRequestDto,
  ): Promise<void> {
    return this.logoutUseCase.execute(userId, body);
  }
}
