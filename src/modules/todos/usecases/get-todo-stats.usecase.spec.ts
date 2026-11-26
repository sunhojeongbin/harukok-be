// GetTodoStatsUseCase — 성공 / NOT_FOUND 계열 / 권한 / 저장 실패 (CLAUDE.md 5장) + 기간 검증 (API 설계서 4장 13번)
import { BusinessException } from '../../../common/errors/business.exception';
import { CommonErrors } from '../../../common/errors/common.errors';
import { fakeStore, USER } from '../../../../test/fixtures/fake-todos-store';
import { GetTodoStatsUseCase } from './get-todo-stats.usecase';

const DB_DOWN = new Error('fake db down');

const DAYS = [
  { date: '2026-11-22', totalCount: 2, completedCount: 1 },
  { date: '2026-11-23', totalCount: 0, completedCount: 0 },
  { date: '2026-11-24', totalCount: 3, completedCount: 2 },
];

async function expectValidationFailed(promise: Promise<unknown>) {
  await expect(promise).rejects.toBeInstanceOf(BusinessException);
  await expect(promise).rejects.toMatchObject({
    definition: CommonErrors.VALIDATION_FAILED,
  });
}

describe('GetTodoStatsUseCase', () => {
  // 2026-11-26 명세 변경: 감싸는 객체 · startDate · endDate · summary 없이 날짜별 배열만
  it('성공: 날짜별 배열을 그대로 돌려준다', async () => {
    const store = fakeStore({ countByDate: jest.fn().mockResolvedValue(DAYS) });

    await expect(
      new GetTodoStatsUseCase(store).execute(USER, {
        startDate: '2026-11-22',
        endDate: '2026-11-24',
      }),
    ).resolves.toEqual(DAYS);
  });

  it('NOT_FOUND 계열: 할 일이 없어도 404 가 아니다 — 0 으로 채운 배열', async () => {
    const empty = [{ date: '2026-11-22', totalCount: 0, completedCount: 0 }];
    const store = fakeStore({
      countByDate: jest.fn().mockResolvedValue(empty),
    });

    await expect(
      new GetTodoStatsUseCase(store).execute(USER, {
        startDate: '2026-11-22',
        endDate: '2026-11-22',
      }),
    ).resolves.toEqual(empty);
  });

  it('권한: Bearer 사용자 ID 와 기간을 저장소에 넘긴다', async () => {
    const store = fakeStore({ countByDate: jest.fn().mockResolvedValue([]) });

    await new GetTodoStatsUseCase(store).execute('fake-bearer-user', {
      startDate: '2026-11-22',
      endDate: '2026-11-28',
    });

    expect(store.countByDate).toHaveBeenCalledWith(
      'fake-bearer-user',
      '2026-11-22',
      '2026-11-28',
    );
  });

  it('저장 실패: 그대로 전파한다', async () => {
    const store = fakeStore({
      countByDate: jest.fn().mockRejectedValue(DB_DOWN),
    });

    await expect(
      new GetTodoStatsUseCase(store).execute(USER, {
        startDate: '2026-11-22',
        endDate: '2026-11-28',
      }),
    ).rejects.toBe(DB_DOWN);
  });

  describe('기간 검증', () => {
    it('startDate > endDate 면 VALIDATION_FAILED, 저장소를 부르지 않는다', async () => {
      const store = fakeStore();

      await expectValidationFailed(
        new GetTodoStatsUseCase(store).execute(USER, {
          startDate: '2026-11-28',
          endDate: '2026-11-22',
        }),
      );
      expect(store.countByDate).not.toHaveBeenCalled();
    });

    it.each([
      ['하루 (startDate == endDate)', '2026-11-22', '2026-11-22'],
      ['42일 (월간 6주 그리드)', '2026-10-26', '2026-12-06'],
      ['42일 — 윤년 2월을 걸쳐도', '2028-02-01', '2028-03-13'],
    ])('%s 은 통과', async (_label, startDate, endDate) => {
      const store = fakeStore({ countByDate: jest.fn().mockResolvedValue([]) });

      await new GetTodoStatsUseCase(store).execute(USER, {
        startDate,
        endDate,
      });

      expect(store.countByDate).toHaveBeenCalled();
    });

    it.each([
      ['43일', '2026-10-26', '2026-12-07'],
      ['1년', '2026-01-01', '2026-12-31'],
    ])('%s 은 VALIDATION_FAILED', async (_label, startDate, endDate) => {
      const store = fakeStore();

      await expectValidationFailed(
        new GetTodoStatsUseCase(store).execute(USER, { startDate, endDate }),
      );
      expect(store.countByDate).not.toHaveBeenCalled();
    });
  });
});
