// SQLite schema. Migrations run by PRAGMA user_version.
import type { Db } from './types';

export const MIGRATIONS: string[] = [
  // v1
  `
  CREATE TABLE profiles (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, colour TEXT NOT NULL, created_at TEXT NOT NULL,
    rank TEXT NOT NULL DEFAULT 'Junior Detective', read_aloud INTEGER NOT NULL DEFAULT 1,
    school_sync_concept TEXT, total_minutes INTEGER NOT NULL DEFAULT 0, onboarded INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE concept_progress (
    profile_id TEXT NOT NULL, concept_id TEXT NOT NULL, level INTEGER NOT NULL DEFAULT 0, stop_step INTEGER NOT NULL DEFAULT 0,
    explain_correct_count INTEGER NOT NULL DEFAULT 0, last_explain_example TEXT, last_explain_at TEXT, twist_passed INTEGER NOT NULL DEFAULT 0,
    know_it_last_try TEXT, last_seen_at TEXT, started_at TEXT, finished_at TEXT,
    PRIMARY KEY (profile_id, concept_id)
  );
  CREATE TABLE reviews (
    profile_id TEXT NOT NULL, concept_id TEXT NOT NULL, due_at TEXT NOT NULL, interval_days INTEGER NOT NULL,
    PRIMARY KEY (profile_id, concept_id)
  );
  CREATE TABLE attempts (
    id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, concept_id TEXT NOT NULL, kind TEXT NOT NULL, item_id TEXT NOT NULL,
    choice_id TEXT NOT NULL, correct INTEGER NOT NULL, first_try INTEGER NOT NULL, with_help INTEGER NOT NULL DEFAULT 0,
    misconception_id TEXT, created_at TEXT NOT NULL
  );
  CREATE INDEX attempts_profile_concept ON attempts (profile_id, concept_id, created_at);
  CREATE TABLE misconceptions (
    profile_id TEXT NOT NULL, misconception_id TEXT NOT NULL, times INTEGER NOT NULL DEFAULT 0, cleared INTEGER NOT NULL DEFAULT 0,
    correct_since INTEGER NOT NULL DEFAULT 0, last_at TEXT,
    PRIMARY KEY (profile_id, misconception_id)
  );
  CREATE TABLE cases (
    id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, case_id TEXT NOT NULL, verdict TEXT NOT NULL, answer_mode TEXT NOT NULL,
    transcript TEXT, ideas_found TEXT, misconceptions_found TEXT, child_feedback TEXT, parent_note TEXT, audio_path TEXT, created_at TEXT NOT NULL
  );
  CREATE INDEX cases_profile ON cases (profile_id, case_id, created_at);
  CREATE TABLE missions (
    profile_id TEXT NOT NULL, concept_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', answer_id TEXT, photo_path TEXT,
    opened_at TEXT, done_at TEXT,
    PRIMARY KEY (profile_id, concept_id)
  );
  CREATE TABLE sky_log (
    id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, observed TEXT NOT NULL, photo_path TEXT, data_snapshot TEXT, created_at TEXT NOT NULL
  );
  CREATE TABLE places_found (
    profile_id TEXT NOT NULL, place_id TEXT NOT NULL, found_at TEXT NOT NULL, PRIMARY KEY (profile_id, place_id)
  );
  CREATE TABLE lab_solved (
    profile_id TEXT NOT NULL, challenge_id TEXT NOT NULL, solved_at TEXT NOT NULL, PRIMARY KEY (profile_id, challenge_id)
  );
  CREATE TABLE why_log (
    id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, concept_id TEXT NOT NULL, question TEXT NOT NULL, answer TEXT NOT NULL,
    in_scope INTEGER NOT NULL, source TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE weather_cache (
    place_id TEXT NOT NULL, kind TEXT NOT NULL, json TEXT NOT NULL, fetched_at TEXT NOT NULL, PRIMARY KEY (place_id, kind)
  );
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, started_at TEXT NOT NULL, ended_at TEXT
  );
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrate(db: Db): Promise<number> {
  const row = await db.first<{ user_version: number }>('PRAGMA user_version');
  const from = row?.user_version ?? 0;
  for (let v = from; v < MIGRATIONS.length; v++) {
    await db.tx(async () => {
      await db.exec(MIGRATIONS[v]);
      await db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
  return SCHEMA_VERSION;
}
