export declare function run(
  args: string[],
  cwd: string,
): { status: number | null; stdout: string; stderr: string };
export declare function refExists(ref: string, cwd: string): boolean;
export declare function fileInRef(
  ref: string,
  path: string,
  cwd: string,
): boolean;
export declare function defaultBase(cwd: string): string | null;
export declare function mergeBase(base: string, cwd: string): string;
