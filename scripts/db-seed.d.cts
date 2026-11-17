import type { Client } from 'pg';

export interface SeedTerm {
  version: string;
  title: string;
  contentUrl: string;
  effectiveFrom: string;
}

export declare const TEMP_TERMS: readonly SeedTerm[];
/** 임시 이용약관을 넣는다. 이미 있으면 건너뛴다. 새로 넣은 행 수를 돌려준다. */
export declare function seedTerms(client: Client): Promise<number>;

/** 개발 전용 테스트 계정 (src/modules/auth/social/dev-test-login.ts 와 같은 값) */
export declare const TEST_ACCOUNT: {
  readonly provider: 'GOOGLE';
  readonly providerUserId: string;
  readonly email: string;
  readonly name: string;
};
/** 테스트 계정을 넣는다. 이미 있으면 건너뛴다. 사용자ID 와 새로 만들었는지를 돌려준다. */
export declare function seedTestAccount(
  client: Client,
): Promise<{ userId: string; created: boolean }>;
