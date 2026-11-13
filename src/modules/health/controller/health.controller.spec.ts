import { CheckHealthUseCase } from '../usecases/check-health.usecase';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('GET /health 는 CheckHealthUseCase 결과를 그대로 돌려준다', async () => {
    const execute = jest.fn().mockResolvedValue({ status: 'ok', db: 'up' });
    const controller = new HealthController({
      execute,
    } as unknown as CheckHealthUseCase);

    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      db: 'up',
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
