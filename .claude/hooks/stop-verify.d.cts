export declare const MAX_RETRIES: number;
export declare function statePath(
  projectDir: string,
  sessionId: string,
): string;
export declare function nextAction(
  failuresBefore: number,
  passed: boolean,
): 'pass' | 'block' | 'give-up';
export declare function runStop(opts: {
  projectDir: string;
  sessionId?: string;
  stopHookActive?: boolean;
  verify?: (projectDir: string) => { passed: boolean; output: string };
}): { exitCode: number; stderr: string };
export declare function defaultVerify(
  projectDir: string,
  spawn?: (
    cmd: string,
    args: string[],
    opts: Record<string, unknown>,
  ) => {
    status: number | null;
    signal?: string | null;
    stdout?: string;
    stderr?: string;
    error?: Error;
  },
): { passed: boolean; output: string };
