import { Repository } from 'typeorm';
import { BusinessException } from '../../../common/errors/business.exception';
import { Term } from '../entities/term.entity';
import { TermsErrors } from '../errors/terms.errors';
import { GetCurrentTermsUseCase } from './get-current-terms.usecase';

const fakeTerm: Term = {
  id: '00000000-0000-7000-8000-000000000001',
  version: '1.1',
  title: '가짜 이용약관',
  contentUrl: 'https://example.com/terms/1.1',
  effectiveFrom: new Date('2026-06-01T00:00:00Z'),
  createdAt: new Date('2026-05-01T00:00:00Z'),
};

function useCaseWith(findOne: jest.Mock) {
  return new GetCurrentTermsUseCase({ findOne } as unknown as Repository<Term>);
}

describe('GetCurrentTermsUseCase', () => {
  it('성공: 현행 이용약관 1개를 응답 필드({ id, version, contentUrl })만 담아 돌려준다', async () => {
    const findOne = jest.fn().mockResolvedValue(fakeTerm);

    await expect(useCaseWith(findOne).execute()).resolves.toEqual({
      id: fakeTerm.id,
      version: '1.1',
      contentUrl: 'https://example.com/terms/1.1',
    });
  });

  it('NOT_FOUND: 시행 중인 이용약관이 없으면 TERM_NOT_FOUND 를 던진다', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const result = useCaseWith(findOne).execute();

    await expect(result).rejects.toBeInstanceOf(BusinessException);
    await expect(result).rejects.toMatchObject({
      definition: TermsErrors.TERM_NOT_FOUND,
    });
  });

  it('조회 실패: 저장소 오류는 그대로 전파한다 (전역 필터가 500 처리)', async () => {
    const error = new Error('fake db down');
    const findOne = jest.fn().mockRejectedValue(error);

    await expect(useCaseWith(findOne).execute()).rejects.toBe(error);
  });

  it('시행일 조건을 걸고 시행일 → 등록일 → id 내림차순으로 1개를 고른다', async () => {
    const findOne = jest.fn().mockResolvedValue(fakeTerm);

    await useCaseWith(findOne).execute();

    const [options] = findOne.mock.calls[0] as [
      { where: { effectiveFrom: unknown }; order: Record<string, string> },
    ];
    expect(options.where.effectiveFrom).toBeDefined();
    expect(options.order).toEqual({
      effectiveFrom: 'DESC',
      createdAt: 'DESC',
      id: 'DESC',
    });
  });
});
