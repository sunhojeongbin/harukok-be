import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BusinessException } from '../../../common/errors/business.exception';
import { HealthErrors } from '../errors/health.errors';

export interface HealthResult {
  status: 'ok';
  db: 'up';
}

@Injectable()
export class CheckHealthUseCase {
  static readonly DB_TIMEOUT_MS = 2000;

  constructor(private readonly dataSource: DataSource) {}

  async execute(): Promise<HealthResult> {
    if (!this.dataSource.isInitialized) {
      throw new BusinessException(HealthErrors.DB_UNAVAILABLE);
    }
    let timer: NodeJS.Timeout | undefined;
    try {
      const rows = await Promise.race([
        this.dataSource.query<{ ok: number }[]>('SELECT 1 AS ok'),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('health check timeout')),
            CheckHealthUseCase.DB_TIMEOUT_MS,
          );
        }),
      ]);
      if (rows[0]?.ok !== 1) throw new Error('unexpected health result');
      return { status: 'ok', db: 'up' };
    } catch {
      throw new BusinessException(HealthErrors.DB_UNAVAILABLE);
    } finally {
      clearTimeout(timer);
    }
  }
}
