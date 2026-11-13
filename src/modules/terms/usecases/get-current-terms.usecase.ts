import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Raw, Repository } from 'typeorm';
import { BusinessException } from '../../../common/errors/business.exception';
import { TermResponseDto } from '../dto/term-response.dto';
import { Term } from '../entities/term.entity';
import { TermsErrors } from '../errors/terms.errors';

@Injectable()
export class GetCurrentTermsUseCase {
  constructor(
    @InjectRepository(Term) private readonly terms: Repository<Term>,
  ) {}

  /** 시행 중(effective_from <= DB now())인 최신 이용약관 1개. 동률은 등록일 → id(uuidv7) 순. */
  async execute(): Promise<TermResponseDto> {
    const term = await this.terms.findOne({
      where: { effectiveFrom: Raw((column) => `${column} <= now()`) },
      order: { effectiveFrom: 'DESC', createdAt: 'DESC', id: 'DESC' },
    });
    if (!term) throw new BusinessException(TermsErrors.TERM_NOT_FOUND);
    return { id: term.id, version: term.version, contentUrl: term.contentUrl };
  }
}
