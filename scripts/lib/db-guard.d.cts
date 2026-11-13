export declare const DESTRUCTIVE_DB_NAMES: string[];
export declare function parseDbTarget(url: string): {
  host: string;
  database: string | null;
};
export declare function isLocalHost(host: string): boolean;
export declare function assertDestructiveAllowed(url: string): void;
export declare function assertDbNameDestructiveAllowed(name: string): void;
