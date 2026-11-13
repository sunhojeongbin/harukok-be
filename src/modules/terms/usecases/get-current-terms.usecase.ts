import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Raw, Repository } from 'typeorm';
import { TermResponseDto } from '../dto/term-response.dto';
import { Term, TERM_TYPES } from '../entities/term.entity';

/** a 가 b 보다 나중 버전인가: 시행일 → 등록일 → id(uuidv7, 시간순) */
function isLater(a: Term, b: Term): boolean {
  const byEffective = a.effectiveFrom.getTime() - b.effectiveFrom.getTime();
  if (byEffective !== 0) return byEffective > 0;
  const byCreated = a.createdAt.getTime() - b.createdAt.getTime();
  if (byCreated !== 0) return byCreated > 0;
  return a.id > b.id;
}

@Injectable()
export class GetCurrentTermsUseCase {
  constructor(
    @InjectRepository(Term) private readonly terms: Repository<Term>,
  ) {}

  /** 유형별로 시행 중(effective_from <= DB now())인 최신 버전 1개씩. 약관은 몇 행뿐이라 선택은 앱에서 한다. */
  async execute(): Promise<TermResponseDto[]> {
    const effective = await this.terms.find({
      where: { effectiveFrom: Raw((column) => `${column} <= now()`) },
    });

    const latest = new Map<Term['type'], Term>();
    for (const term of effective) {
      const current = latest.get(term.type);
      if (!current || isLater(term, current)) latest.set(term.type, term);
    }

    return TERM_TYPES.flatMap((type) => {
      const term = latest.get(type);
      return term
        ? [
            {
              id: term.id,
              type: term.type,
              version: term.version,
              required: term.isRequired,
              contentUrl: term.contentUrl,
            },
          ]
        : [];
    });
  }
}
