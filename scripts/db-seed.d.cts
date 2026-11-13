import type { Client } from 'pg';

export interface SeedTerm {
  type: 'SERVICE' | 'PRIVACY';
  version: string;
  title: string;
  contentUrl: string;
  isRequired: boolean;
  effectiveFrom: string;
}

export declare const TEMP_TERMS: readonly SeedTerm[];
/** 임시 약관을 넣는다. 이미 있으면 건너뛴다. 새로 넣은 행 수를 돌려준다. */
export declare function seedTerms(client: Client): Promise<number>;
