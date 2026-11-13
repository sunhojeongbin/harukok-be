import { Controller, Get } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorBodyDto } from '../../../common/swagger/error-body.dto';
import { TermResponseDto } from '../dto/term-response.dto';
import { GetCurrentTermsUseCase } from '../usecases/get-current-terms.usecase';

@ApiTags('terms')
@Controller('terms')
export class TermsController {
  constructor(private readonly getCurrentTerms: GetCurrentTermsUseCase) {}

  @Get()
  @ApiOperation({
    summary: '현행 이용약관',
    description:
      '시행 중인 최신 이용약관 1개. 인증 없음. 개인정보 처리방침은 API 없이 앱이 노션 링크로 표시',
  })
  @ApiOkResponse({ type: TermResponseDto })
  @ApiNotFoundResponse({
    type: ErrorBodyDto,
    description: 'TERM_NOT_FOUND — 시행 중인 이용약관이 없음',
  })
  get(): Promise<TermResponseDto> {
    return this.getCurrentTerms.execute();
  }
}
