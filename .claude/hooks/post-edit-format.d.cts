export declare function targetsFor(
  filePath: string,
  projectDir: string,
): { eslint: boolean; prettier: boolean } | null;
export type Runner = (
  args: string[],
  cwd: string,
) => { status: number | null; output: string };
export declare function processFile(
  filePath: string,
  projectDir: string,
  runner?: Runner,
): { ok: true } | { ok: false; message: string };
export declare function decide(input: {
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  cwd?: string;
}): { allow: true } | { allow: false; reason: string };
