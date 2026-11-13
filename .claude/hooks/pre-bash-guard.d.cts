export type Decision = { allow: true } | { allow: false; reason: string };
export declare function decide(
  input: {
    tool_name?: string;
    tool_input?: Record<string, unknown>;
    cwd?: string;
  },
  ctx?: {
    projectDir?: string;
    home?: string;
    base?: string | null;
    fileInBase?: (relPath: string) => boolean;
  },
): Decision;
