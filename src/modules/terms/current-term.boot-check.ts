import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { BusinessException } from '../../common/errors/business.exception';
import { TermsErrors } from './errors/terms.errors';
import { GetCurrentTermsUseCase } from './usecases/get-current-terms.usecase';

/**
 * 기동 시 시행 중인 이용약관이 없으면 경고한다. 부팅은 막지 않는다.
 * 약관이 없으면 신규 가입이 동의 기록 없이 진행되므로(API 설계서 4장 1번 5단계) 배포 직후 알아채기 위함이다.
 */
@Injectable()
export class CurrentTermBootCheck implements OnApplicationBootstrap {
  private readonly logger = new Logger(CurrentTermBootCheck.name);

  constructor(private readonly currentTerms: GetCurrentTermsUseCase) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.currentTerms.execute();
    } catch (error) {
      const noTerm =
        error instanceof BusinessException &&
        error.definition.code === TermsErrors.TERM_NOT_FOUND.code;
      this.logger.warn(
        noTerm
          ? '시행 중인 이용약관이 없다 — 신규 가입이 약관 동의 기록 없이 진행된다'
          : `기동 시 이용약관 확인 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
