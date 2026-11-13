import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  MAX_RETRIES,
  defaultVerify,
  nextAction,
  runStop,
  statePath,
} from '../../.claude/hooks/stop-verify.cjs';

describe('stop-verify nextAction', () => {
  it('통과·재시도·포기를 구분한다', () => {
    expect(MAX_RETRIES).toBe(3);
    expect(nextAction(0, true)).toBe('pass');
    expect(nextAction(2, true)).toBe('pass');
    expect(nextAction(0, false)).toBe('block');
    expect(nextAction(1, false)).toBe('block');
    expect(nextAction(2, false)).toBe('give-up');
  });
  it('상태 파일은 세션별로 분리된다', () => {
    expect(statePath('/p', 'abc')).toBe('/p/.claude/state/stop-abc.json');
    expect(statePath('/p', 'abc')).not.toBe(statePath('/p', 'def'));
  });
});

describe('stop-verify runStop', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stop-verify-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const fail = (output = 'boom') => ({ passed: false, output });
  const pass = () => ({ passed: true, output: 'ok' });
  const run = (v: () => { passed: boolean; output: string }, id = 's1') =>
    runStop({ projectDir: dir, sessionId: id, verify: v });
  const readFailures = (id = 's1') =>
    (
      JSON.parse(fs.readFileSync(statePath(dir, id), 'utf8')) as {
        failures: number;
      }
    ).failures;

  it('실패 2회는 차단하고 횟수를 기록, 이어진 통과는 상태를 지운다', () => {
    const r1 = run(() => fail());
    expect(r1.exitCode).toBe(2);
    expect(r1.stderr).toContain('1/3');
    expect(readFailures()).toBe(1);
    const r2 = run(() => fail());
    expect(r2.exitCode).toBe(2);
    expect(r2.stderr).toContain('2/3');
    expect(readFailures()).toBe(2);
    const r3 = run(pass);
    expect(r3.exitCode).toBe(0);
    expect(fs.existsSync(statePath(dir, 's1'))).toBe(false);
  });

  it('세 번째 실패는 STUCK 파일을 남기고 exit 0 으로 포기한다', () => {
    run(() => fail());
    run(() => fail());
    const r = run(() => fail('마지막 출력'));
    expect(r.exitCode).toBe(0);
    expect(r.stderr).toContain('사람 확인 필요');
    const stuck = path.join(dir, '.claude', 'state', 'STUCK-s1.md');
    expect(fs.readFileSync(stuck, 'utf8')).toContain('마지막 출력');
    expect(fs.existsSync(statePath(dir, 's1'))).toBe(false);
  });

  it('차단 메시지는 출력 마지막 80줄만 담는다', () => {
    const out = Array.from({ length: 200 }, (_, i) => `line${i}`).join('\n');
    const r = run(() => fail(out));
    expect(r.stderr).toContain('line199');
    expect(r.stderr).toContain('line120');
    expect(r.stderr).not.toContain('line119\n');
  });

  it('세션이 다르면 실패 횟수가 섞이지 않는다', () => {
    run(() => fail(), 'a');
    run(() => fail(), 'a');
    expect(run(() => fail(), 'b').exitCode).toBe(2);
  });

  it('깨진 상태 파일은 0회로 취급한다', () => {
    fs.mkdirSync(path.dirname(statePath(dir, 's1')), { recursive: true });
    fs.writeFileSync(statePath(dir, 's1'), '{not json');
    expect(run(() => fail()).exitCode).toBe(2);
    expect(readFailures()).toBe(1);
  });

  it('stop_hook_active 여도 검증을 건너뛰지 않는다 (재시도 횟수로 제어)', () => {
    expect(
      runStop({
        projectDir: dir,
        sessionId: 's1',
        stopHookActive: true,
        verify: () => fail(),
      }).exitCode,
    ).toBe(2);
  });

  it('세션 id 의 경로 문자는 무해화한다', () => {
    expect(statePath('/p', '../../x')).toBe(
      '/p/.claude/state/stop-______x.json',
    );
  });
});

describe('stop-verify defaultVerify 시간 제한', () => {
  it('타임아웃·SIGKILL 옵션을 넘기고, 시간 초과는 실패와 안내 메시지가 된다', () => {
    let opts: Record<string, unknown> = {};
    const r = defaultVerify('/p', (_cmd, _args, o) => {
      opts = o;
      return {
        status: null,
        signal: 'SIGKILL',
        stdout: 'partial',
        stderr: '',
        error: Object.assign(new Error('spawnSync npm ETIMEDOUT'), {
          code: 'ETIMEDOUT',
        }),
      };
    });
    expect(opts.timeout).toBe(570_000);
    expect(opts.killSignal).toBe('SIGKILL');
    expect(r.passed).toBe(false);
    expect(r.output).toContain('검증 시간 초과(570초)');
    expect(r.output).toContain('partial');
  });
  it('정상 종료(status 0)는 통과', () => {
    const r = defaultVerify('/p', () => ({
      status: 0,
      stdout: 'ok',
      stderr: '',
    }));
    expect(r.passed).toBe(true);
  });
});
