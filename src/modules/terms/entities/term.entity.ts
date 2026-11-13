import { Column, Entity, PrimaryColumn } from 'typeorm';

/** terms — 이용약관 버전. 스키마 원본은 migrations/ 001 + 006 (이용약관 단일화) */
@Entity('terms')
export class Term {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'varchar', length: 20 })
  version: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ name: 'content_url', type: 'text' })
  contentUrl: string;

  @Column({ name: 'effective_from', type: 'timestamptz' })
  effectiveFrom: Date;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
