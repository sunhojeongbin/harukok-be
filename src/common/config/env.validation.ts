import 'reflect-metadata';
import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsBase64,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
  validateSync,
} from 'class-validator';

const NODE_ENVS = ['development', 'test', 'production'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

/**
 * 개발 전용 기능(Swagger · 테스트 로그인)은 이 값일 때만 켠다 — '운영이면 끈다' 가 아니라 허용 목록 (보안 점검 #2).
 * NODE_ENV 가 빠지거나 낯선 값이면 꺼진다.
 */
export function isDevelopmentLike(nodeEnv: string | undefined): boolean {
  return nodeEnv === 'development' || nodeEnv === 'test';
}

@ValidatorConstraint({ name: 'decodesTo32Bytes' })
class DecodesTo32Bytes implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return (
      typeof value === 'string' && Buffer.from(value, 'base64').length === 32
    );
  }
}

/** "a, b," → ['a', 'b']. 문자열이 아니면 그대로 둔다(검증이 거부) */
function commaList(value: unknown): unknown {
  return typeof value === 'string'
    ? value
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== '')
    : value;
}

// 단위가 늘면 실제로 쓰는 키만 여기에 추가한다.
export class EnvironmentVariables {
  /** 필수 — 빠지면 개발 전용 기능이 어떻게 판정될지 모호해진다 */
  @IsIn(NODE_ENVS)
  NODE_ENV: NodeEnv;

  @Matches(/^postgres(ql)?:\/\/\S+$/)
  DATABASE_URL: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET: string;

  /** AES-256-GCM 키: base64 32바이트 */
  @IsBase64()
  @Validate(DecodesTo32Bytes)
  TOKEN_ENCRYPTION_KEY: string;

  @IsString()
  @IsNotEmpty()
  APPLE_TEAM_ID: string;

  @IsString()
  @IsNotEmpty()
  APPLE_KEY_ID: string;

  /** .p8 내용. 환경변수에서 흔한 이스케이프 줄바꿈(\n)을 실제 줄바꿈으로 바꾼다 */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/\\n/g, '\n') : value,
  )
  @Matches(/-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----/)
  APPLE_PRIVATE_KEY: string;

  /** 네이티브 앱 번들 ID (Service ID 아님) */
  @IsString()
  @IsNotEmpty()
  APPLE_CLIENT_ID: string;

  /** iOS·Android·서버 OAuth 클라이언트 ID — 쉼표 구분 */
  @Transform(({ value }: { value: unknown }) => commaList(value))
  @ArrayNotEmpty()
  GOOGLE_CLIENT_IDS: string[];

  /** 카카오 OIDC id_token 의 aud (앱 키) — 쉼표 구분 */
  @Transform(({ value }: { value: unknown }) => commaList(value))
  @ArrayNotEmpty()
  KAKAO_APP_KEYS: string[];

  /** 탈퇴 시 카카오 unlink (서버 → 카카오, 사용자 토큰 불필요) */
  @IsString()
  @IsNotEmpty()
  KAKAO_ADMIN_KEY: string;

  /** 개발 전용 테스트 로그인 (docs/guides/swagger-social-login.md). 'true'·'false' 만 받는다. 운영에서는 켤 수 없다 */
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  DEV_TEST_LOGIN: boolean = false;
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
  if (env.DEV_TEST_LOGIN && !isDevelopmentLike(env.NODE_ENV)) {
    throw new Error(
      '환경변수가 올바르지 않습니다: DEV_TEST_LOGIN 은 NODE_ENV=development · test 에서만 켤 수 있습니다.',
    );
  }
  return env;
}
