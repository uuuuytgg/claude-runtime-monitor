const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.resolve('D:/ClaudeData/claude-runtime-monitor/apps/server/storage/crm.db'));

console.log('Before:');
const row = db.prepare("SELECT sql FROM sqlite_master WHERE name='runtime_events'").get();
console.log(row.sql);

// recreate with ISO UTC default
db.exec("CREATE TABLE IF NOT EXISTS runtime_events_v2 (" +
  "id INTEGER PRIMARY KEY AUTOINCREMENT," +
  "source TEXT NOT NULL," +
  "type TEXT NOT NULL," +
  "title TEXT NOT NULL," +
  "detail TEXT," +
  "severity TEXT NOT NULL DEFAULT 'info'," +
  "raw TEXT," +
  "created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))" +
  ")");

// copy data
try { db.exec("INSERT INTO runtime_events_v2 SELECT * FROM runtime_events"); } catch(e) { console.log('copy failed:', e.message); }

// swap
db.exec("DROP TABLE IF EXISTS runtime_events_old");
db.exec("ALTER TABLE runtime_events RENAME TO runtime_events_old");
db.exec("ALTER TABLE runtime_events_v2 RENAME TO runtime_events");
db.exec("DROP TABLE runtime_events_old");

console.log('After:');
const row2 = db.prepare("SELECT sql FROM sqlite_master WHERE name='runtime_events'").get();
console.log(row2.sql);

db.close();
