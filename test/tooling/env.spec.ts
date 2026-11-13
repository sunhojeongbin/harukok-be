import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadEnv, parseEnvText } from '../../scripts/env.cjs';

describe('parseEnvText', () => {
  it('KEY=VALUE, 주석, 빈 줄, 따옴표, 줄 끝 주석을 처리한다', () => {
    const text = [
      '# 주석',
      '',
      'A=1',
      'B="two words"',
      "C='x # y'",
      'D=value   # 뒤 주석',
      'E=',
      'NOEQ',
    ].join('\n');

    expect(parseEnvText(text)).toEqual({
      A: '1',
      B: 'two words',
      C: 'x # y',
      D: 'value',
      E: '',
    });
  });
});

describe('loadEnv', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-spec-'));
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('.env 값을 읽고, 같은 키는 프로세스 환경변수가 우선한다', () => {
    fs.writeFileSync(
      path.join(dir, '.env'),
      'DATABASE_URL=postgresql://fake@localhost/from_file\nONLY_FILE=1\n',
    );

    const env = loadEnv(dir, {
      DATABASE_URL: 'postgresql://fake@localhost/from_process',
    });

    expect(env.DATABASE_URL).toBe('postgresql://fake@localhost/from_process');
    expect(env.ONLY_FILE).toBe('1');
  });

  it('.env 가 없으면 프로세스 환경변수만 쓴다 (CI)', () => {
    expect(loadEnv(dir, { A: 'x' })).toEqual({ A: 'x' });
  });

  it('프로세스 환경변수의 빈 값은 .env 값을 덮지 않는다', () => {
    fs.writeFileSync(path.join(dir, '.env'), 'A=from_file\n');

    expect(loadEnv(dir, { A: '' }).A).toBe('from_file');
  });
});
