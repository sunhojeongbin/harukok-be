export declare function protectedReason(
  target: string,
  ctx: {
    projectDir: string;
    base?: string | null;
    fileInBase?: (relPath: string) => boolean;
  },
): string | null;
export declare function isProtectedPath(
  target: string,
  ctx: {
    projectDir: string;
    base?: string | null;
    fileInBase?: (relPath: string) => boolean;
  },
): boolean;
