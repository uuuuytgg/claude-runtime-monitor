import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { readLatestClaudeRequestFromDb } from '../cc-switch-poller.js';

function createDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE proxy_request_logs (
      request_id TEXT,
      app_type TEXT,
      provider_type TEXT,
      model TEXT,
      request_model TEXT,
      input_tokens INTEGER,
      cache_read_tokens INTEGER,
      total_cost_usd REAL,
      session_id TEXT,
      status_code INTEGER,
      created_at INTEGER
    );
  `);
  return db;
}

describe('cc-switch poller', () => {
  it('ignores newer Codex rows and reads the latest Claude Code request', () => {
    const db = createDb();
    const insert = db.prepare(`
      INSERT INTO proxy_request_logs (
        request_id,
        app_type,
        provider_type,
        model,
        request_model,
        input_tokens,
        cache_read_tokens,
        total_cost_usd,
        session_id,
        status_code,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(
      'codex-latest',
      'codex',
      'codex_session',
      'gpt-5.5',
      'gpt-5.5',
      200_000,
      0,
      14,
      'codex-session',
      200,
      2_000,
    );
    insert.run(
      'claude-older',
      'claude',
      null,
      'mimo-v2.5-pro',
      'claude-opus-4-8',
      80_000,
      20_000,
      1,
      'claude-session',
      200,
      1_000,
    );
    insert.run(
      'claude-same-session',
      'claude',
      null,
      'mimo-v2.5-pro',
      'claude-haiku-4-5',
      1_000,
      0,
      0.5,
      'claude-session',
      200,
      900,
    );

    const result = readLatestClaudeRequestFromDb(db, 3_000_000);

    expect(result).toMatchObject({
      requestId: 'claude-older',
      model: 'claude-opus-4-8',
      sessionId: 'claude-session',
      contextUsed: 50,
      cost: '¥7.25',
      sessionCostTotal: '¥10.88',
      requestsInSession: 2,
      available: true,
    });

    db.close();
  });
});
