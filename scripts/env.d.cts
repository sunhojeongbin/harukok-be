export declare function parseEnvText(text: string): Record<string, string>;
export declare function loadEnv(
  root: string,
  processEnv?: NodeJS.ProcessEnv,
): Record<string, string>;
