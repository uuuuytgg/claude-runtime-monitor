import Database from 'better-sqlite3';
import { resolve } from 'path';
const db = new Database(resolve('storage/crm.db'));

const sql = db.prepare("SELECT sql FROM sqlite_master WHERE name='runtime_events'").get() as any;
console.log('Before:', sql.sql);

// recreate table with ISO UTC default
db.exec(`CREATE TABLE IF NOT EXISTS runtime_events_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  severity TEXT NOT NULL DEFAULT 'info',
  raw TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
)`);

// copy data
db.exec('INSERT INTO runtime_events_v2 SELECT * FROM runtime_events');

// swap
db.exec('ALTER TABLE runtime_events RENAME TO runtime_events_old');
db.exec('ALTER TABLE runtime_events_v2 RENAME TO runtime_events');
db.exec('DROP TABLE runtime_events_old');

const sql2 = db.prepare("SELECT sql FROM sqlite_master WHERE name='runtime_events'").get() as any;
console.log('After:', sql2.sql);
db.close();
