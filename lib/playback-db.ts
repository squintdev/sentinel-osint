/**
 * Read-only access to the playback capture store.
 * The DB is written by services/capture/index.ts (a separate PM2 process)
 * and read by the /api/playback/* routes. We open in readonly mode to make
 * sure we never accidentally mutate capture data from the web app.
 */

import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const DB_PATH = process.env.SENTINEL_DB ?? join(process.cwd(), 'data', 'sentinel.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database | null {
  if (_db) return _db;
  if (!existsSync(DB_PATH)) return null;
  try {
    _db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    _db.pragma('journal_mode = WAL');
    return _db;
  } catch (err) {
    console.error('[playback-db] open failed:', (err as Error).message);
    return null;
  }
}
