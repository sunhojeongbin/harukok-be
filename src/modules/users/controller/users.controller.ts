import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AccessTokenGuard,
  CurrentUserId,
} from '../../../common/auth/access-token.guard';
import { ErrorBodyDto } from '../../../common/swagger/error-body.dto';
import { UserMeResponseDto } from '../dto/user-me.response.dto';
import { GetMeUseCase } from '../usecases/get-me.usecase';
import { WithdrawUseCase } from '../usecases/withdraw.usecase';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(AccessTokenGuard)
@ApiUnauthorizedResponse({
  type: ErrorBodyDto,
  description: 'ACCESS_TOKEN_INVALID',
})
@ApiNotFoundResponse({
  type: ErrorBodyDto,
  description: 'USER_NOT_FOUND — 탈퇴 후 남은 액세스 토큰',
})
@Controller('users')
export class UsersController {
  constructor(
    private readonly getMe: GetMeUseCase,
    private readonly withdraw: WithdrawUseCase,
  ) {}

  @Get('me')
  @ApiOperation({
    summary: '내 정보 (사용자명 · 로그인 제공자)',
    description:
      '설정 화면의 "로그인 제공자 표시". name·email 은 NULL 일 수 있다',
  })
  @ApiOkResponse({ type: UserMeResponseDto })
  me(@CurrentUserId() userId: string): Promise<UserMeResponseDto> {
    return this.getMe.execute(userId);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: '회원 탈퇴',
    description:
      '애플 revoke · 카카오 unlink 를 먼저 호출한 뒤 사용자를 삭제한다 (CASCADE 로 소셜 계정·약관 동의·토큰·할 일 전부 파기). 연동 해제가 실패해도 탈퇴는 진행한다. 구글은 앱이 SDK disconnect() 를 먼저 호출한다',
  })
  @ApiNoContentResponse({ description: '탈퇴 완료' })
  remove(@CurrentUserId() userId: string): Promise<void> {
    return this.withdraw.execute(userId);
  }
}
