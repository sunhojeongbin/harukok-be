import 'reflect-metadata';
import { plainToInstance, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
  validateSync,
} from 'class-validator';

const NODE_ENVS = ['development', 'test', 'production'] as const;

// 단위가 늘면 실제로 쓰는 키만 여기에 추가한다 (JWT·제공자 키는 2~4단위).
export class EnvironmentVariables {
  @IsOptional()
  @IsIn(NODE_ENVS)
  NODE_ENV?: (typeof NODE_ENVS)[number];

  @Matches(/^postgres(ql)?:\/\/\S+$/)
  DATABASE_URL: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;
}

/** 부팅 시 환경변수 검증. 오류에는 키 이름만 담고 값은 넣지 않는다 (시크릿 노출 방지). */
export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config);
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length > 0) {
    const keys = errors.map((e) => e.property).join(', ');
    throw new Error(`환경변수가 없거나 올바르지 않습니다: ${keys}`);
  }
  return env;
}
