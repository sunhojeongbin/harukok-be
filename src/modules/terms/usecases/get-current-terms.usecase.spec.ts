import { Repository } from 'typeorm';
import { Term, TermType } from '../entities/term.entity';
import { GetCurrentTermsUseCase } from './get-current-terms.usecase';

let seq = 0;
function term(
  type: TermType,
  version: string,
  effectiveFrom: string,
  extra: Partial<Term> = {},
): Term {
  seq += 1;
  return {
    id: `00000000-0000-7000-8000-${String(seq).padStart(12, '0')}`,
    type,
    version,
    title: `가짜 ${type} ${version}`,
    contentUrl: `https://example.com/${type}/${version}`,
    isRequired: true,
    effectiveFrom: new Date(effectiveFrom),
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...extra,
  };
}

function useCaseWith(find: jest.Mock) {
  return new GetCurrentTermsUseCase({ find } as unknown as Repository<Term>);
}

describe('GetCurrentTermsUseCase', () => {
  it('성공: 유형별 최신 시행본 1개씩, SERVICE → PRIVACY 순으로 응답 필드만 돌려준다', async () => {
    const service2 = term('SERVICE', '2.0', '2026-06-01T00:00:00Z');
    const privacy1 = term('PRIVACY', '1.0', '2026-01-01T00:00:00Z', {
      isRequired: false,
    });
    const find = jest
      .fn()
      .mockResolvedValue([
        privacy1,
        term('SERVICE', '1.0', '2026-01-01T00:00:00Z'),
        service2,
      ]);

    await expect(useCaseWith(find).execute()).resolves.toEqual([
      {
        id: service2.id,
        type: 'SERVICE',
        version: '2.0',
        required: true,
        contentUrl: service2.contentUrl,
      },
      {
        id: privacy1.id,
        type: 'PRIVACY',
        version: '1.0',
        required: false,
        contentUrl: privacy1.contentUrl,
      },
    ]);
  });

  it('시행일이 같으면 나중에 등록된 것(created_at → id)을 고른다', async () => {
    const same = '2026-03-01T00:00:00Z';
    const older = term('SERVICE', '1.1', same, {
      createdAt: new Date('2026-02-01T00:00:00Z'),
    });
    const newer = term('SERVICE', '1.2', same, {
      createdAt: new Date('2026-02-02T00:00:00Z'),
    });
    const sameCreatedLowId = term('PRIVACY', '1.1', same);
    const sameCreatedHighId = term('PRIVACY', '1.2', same);
    const find = jest
      .fn()
      .mockResolvedValue([sameCreatedHighId, newer, older, sameCreatedLowId]);

    const result = await useCaseWith(find).execute();

    expect(result.map((t) => t.version)).toEqual(['1.2', '1.2']);
  });

  it('없음: 시행 중인 약관이 없으면 404 가 아니라 빈 배열', async () => {
    const find = jest.fn().mockResolvedValue([]);

    await expect(useCaseWith(find).execute()).resolves.toEqual([]);
  });

  it('한 유형만 있으면 그 유형만 돌려준다', async () => {
    const find = jest
      .fn()
      .mockResolvedValue([term('PRIVACY', '1.0', '2026-01-01T00:00:00Z')]);

    const result = await useCaseWith(find).execute();

    expect(result.map((t) => t.type)).toEqual(['PRIVACY']);
  });

  it('조회 실패: 저장소 오류는 그대로 전파한다 (전역 필터가 500 처리)', async () => {
    const error = new Error('fake db down');
    const find = jest.fn().mockRejectedValue(error);

    await expect(useCaseWith(find).execute()).rejects.toBe(error);
  });

  it('시행일 조건(effective_from <= now())을 걸어 조회한다', async () => {
    const find = jest.fn().mockResolvedValue([]);

    await useCaseWith(find).execute();

    const [options] = find.mock.calls[0] as [
      { where: { effectiveFrom: unknown } },
    ];
    expect(options.where.effectiveFrom).toBeDefined();
  });
});
