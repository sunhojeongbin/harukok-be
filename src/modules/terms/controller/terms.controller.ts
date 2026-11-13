import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TermResponseDto } from '../dto/term-response.dto';
import { GetCurrentTermsUseCase } from '../usecases/get-current-terms.usecase';

@ApiTags('terms')
@Controller('terms')
export class TermsController {
  constructor(private readonly getCurrentTerms: GetCurrentTermsUseCase) {}

  @Get()
  @ApiOperation({
    summary: '현행 약관 목록',
    description:
      '유형별로 시행 중인 최신 버전 1개씩 (SERVICE, PRIVACY 순). 인증 없음',
  })
  @ApiOkResponse({ type: [TermResponseDto] })
  list(): Promise<TermResponseDto[]> {
    return this.getCurrentTerms.execute();
  }
}
