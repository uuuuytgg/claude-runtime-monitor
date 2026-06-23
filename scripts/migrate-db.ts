import Database from 'better-sqlite3';
import { resolve } from 'path';
const db = new Database(resolve('apps/server/storage/crm.db'));

// Recreate table with ISO UTC default
db.exec(`
  CREATE TABLE IF NOT EXISTS runtime_events_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT,
    severity TEXT NOT NULL DEFAULT 'info',
    raw TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  )
`);

// Copy old data
try { db.exec('INSERT INTO runtime_events_new SELECT * FROM runtime_events'); } catch {}

// Swap tables
db.exec('DROP TABLE IF EXISTS runtime_events_old');
db.exec('ALTER TABLE runtime_events RENAME TO runtime_events_old');
db.exec('ALTER TABLE runtime_events_new RENAME TO runtime_events');
db.exec('DROP TABLE runtime_events_old');

console.log('Done');
db.close();
