export declare function isTestFile(path: string): boolean;
export declare function findViolations(input: {
  deleted: string[];
  added: { file: string; line: string }[];
}): string[];
