import { Column, Entity, PrimaryColumn } from 'typeorm';

/** 응답 순서이기도 하다. */
export const TERM_TYPES = ['SERVICE', 'PRIVACY'] as const;
export type TermType = (typeof TERM_TYPES)[number];

/** terms — 약관 버전. 스키마 원본은 migrations/20261110_001__init_schema.sql */
@Entity('terms')
export class Term {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'varchar', length: 20 })
  type: TermType;

  @Column({ type: 'varchar', length: 20 })
  version: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ name: 'content_url', type: 'text' })
  contentUrl: string;

  @Column({ name: 'is_required', type: 'boolean' })
  isRequired: boolean;

  @Column({ name: 'effective_from', type: 'timestamptz' })
  effectiveFrom: Date;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
