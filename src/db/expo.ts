// expo-sqlite adapter for the Db interface.
import * as SQLite from 'expo-sqlite';
import type { Db, SqlParam } from './types';
import { migrate } from './schema';

let cached: Promise<Db> | null = null;

function adapt(raw: SQLite.SQLiteDatabase): Db {
  return {
    exec: (sql) => raw.execAsync(sql),
    run: async (sql, params = []) => ({ changes: (await raw.runAsync(sql, params as SqlParam[])).changes }),
    all: <T,>(sql: string, params: SqlParam[] = []) => raw.getAllAsync<T>(sql, params),
    first: <T,>(sql: string, params: SqlParam[] = []) => raw.getFirstAsync<T>(sql, params),
    tx: async <T,>(fn: () => Promise<T>) => {
      let out!: T;
      await raw.withTransactionAsync(async () => { out = await fn(); });
      return out;
    },
  };
}

/** Opens globeprobe.db once and runs migrations. */
export function openDb(): Promise<Db> {
  if (!cached) {
    cached = (async () => {
      const raw = await SQLite.openDatabaseAsync('globeprobe.db');
      const db = adapt(raw);
      await db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
      await migrate(db);
      return db;
    })();
  }
  return cached;
}
