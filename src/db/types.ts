// Minimal async database interface so the same queries run on expo-sqlite (app) and node:sqlite (tests).
export type SqlParam = string | number | null;
export interface Db {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlParam[]): Promise<{ changes: number }>;
  all<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  first<T>(sql: string, params?: SqlParam[]): Promise<T | null>;
  tx<T>(fn: () => Promise<T>): Promise<T>;
}
