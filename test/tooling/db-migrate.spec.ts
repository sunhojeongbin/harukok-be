import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  diffSnapshots,
  listMigrations,
  withDatabase,
} from '../../scripts/db-migrate.cjs';

const ROOT = path.resolve(__dirname, '../..');

describe('listMigrations', () => {
  let dir: string;
  const touch = (name: string) =>
    fs.writeFileSync(path.join(dir, name), '-- fake\n');

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-spec-'));
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('버전 순으로 정렬하고 짝이 되는 .down.sql 경로를 붙인다', () => {
    touch('20261112_005__b.sql');
    touch('20261112_005__b.down.sql');
    touch('20261110_001__a.sql');
    touch('20261110_001__a.down.sql');
    touch('README.md');

    const list = listMigrations(dir);

    expect(list.map((m) => m.version)).toEqual([
      '20261110_001',
      '20261112_005',
    ]);
    expect(list[0]).toEqual({
      version: '20261110_001',
      name: 'a',
      up: path.join(dir, '20261110_001__a.sql'),
      down: path.join(dir, '20261110_001__a.down.sql'),
    });
  });

  it('.down.sql 이 없으면 파일 이름을 담아 실패한다', () => {
    touch('20261110_001__a.sql');

    expect(() => listMigrations(dir)).toThrow(/20261110_001__a\.down\.sql/);
  });

  it('.down.sql 만 있고 적용 파일이 없으면 실패한다', () => {
    touch('20261110_001__a.down.sql');

    expect(() => listMigrations(dir)).toThrow(/20261110_001__a\.sql/);
  });

  it('이름 규칙에 맞지 않는 .sql 은 실패한다', () => {
    touch('init.sql');

    expect(() => listMigrations(dir)).toThrow(/init\.sql/);
  });

  it('같은 버전이 두 번 있으면 실패한다', () => {
    touch('20261110_001__a.sql');
    touch('20261110_001__a.down.sql');
    touch('20261110_001__b.sql');
    touch('20261110_001__b.down.sql');

    expect(() => listMigrations(dir)).toThrow(/20261110_001/);
  });

  it('저장소의 migrations/ 는 001, 005 순서다', () => {
    expect(
      listMigrations(path.join(ROOT, 'migrations')).map((m) => m.version),
    ).toEqual(['20261110_001', '20261112_005']);
  });
});

describe('withDatabase', () => {
  it('DB 이름만 바꾸고 사용자·호스트·포트·쿼리는 유지한다', () => {
    expect(
      withDatabase(
        'postgresql://fake@localhost:5432/harukok_dev?sslmode=disable',
        'harukok_check',
      ),
    ).toBe('postgresql://fake@localhost:5432/harukok_check?sslmode=disable');
  });
});

describe('diffSnapshots', () => {
  it('같으면 빈 배열', () => {
    const s = { tables: ['a', 'b'], indexes: ['i'] };

    expect(diffSnapshots(s, { tables: ['a', 'b'], indexes: ['i'] })).toEqual(
      [],
    );
  });

  it('빠진 항목과 늘어난 항목을 종류별로 알려준다', () => {
    expect(
      diffSnapshots(
        { tables: ['a', 'b'], indexes: ['i'] },
        { tables: ['a', 'c'], indexes: ['i'] },
      ),
    ).toEqual(['tables 빠짐: b', 'tables 추가: c']);
  });
});
