import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const STORAGE_DIR = resolve(process.cwd(), 'storage');
mkdirSync(STORAGE_DIR, { recursive: true });

const db = new Database(resolve(STORAGE_DIR, 'crm.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDb(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS runtime_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT,
      severity TEXT NOT NULL DEFAULT 'info',
      raw TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS quota_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      balance TEXT,
      status TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'CNY',
      raw TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS api_usage_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      model TEXT,
      tokens_in INTEGER DEFAULT 0,
      tokens_out INTEGER DEFAULT 0,
      cost TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS provider_api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL UNIQUE,
      api_key TEXT NOT NULL,
      label TEXT,
      base_url TEXT,
      balance_endpoint TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS seed_blacklist (
      provider TEXT NOT NULL UNIQUE,
      blacklisted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );
  `);

  // Migrations for existing DBs: add currency column if missing.
  try {
    db.exec(`ALTER TABLE quota_snapshots ADD COLUMN currency TEXT NOT NULL DEFAULT 'CNY'`);
  } catch {
    // column already exists - ignore
  }

  // Clean all "Claude 已离线" events — they are no longer persisted
  db.exec(`
    DELETE FROM runtime_events
    WHERE source = 'system'
      AND type = 'session_end'
      AND detail LIKE 'No Claude activity%'
  `);
}

export function cleanupOld(): void {
  db.exec(`
    DELETE FROM runtime_events WHERE created_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 days');
    DELETE FROM snapshots WHERE created_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days');
    DELETE FROM quota_snapshots WHERE created_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-90 days');
    DELETE FROM api_usage_records WHERE created_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-180 days');
  `);
}

export default db;
