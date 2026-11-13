import type { Client } from 'pg';

export interface Migration {
  version: string;
  name: string;
  up: string;
  down: string;
}

export type Snapshot = Record<string, string[]>;

export declare const MIGRATIONS_TABLE: string;
export declare function listMigrations(dir: string): Migration[];
export declare function withDatabase(url: string, name: string): string;
export declare function diffSnapshots(
  before: Snapshot,
  after: Snapshot,
): string[];
export declare function migrateUp(
  client: Client,
  dir: string,
): Promise<string[]>;
export declare function migrateDown(
  client: Client,
  dir: string,
  opts?: { all?: boolean },
): Promise<string[]>;
export declare function snapshot(client: Client): Promise<Snapshot>;
export declare function resetDatabase(url: string, dir: string): Promise<void>;
