import { FastifyInstance } from 'fastify';
import { getSnapshot } from './internal.js';
import db from '../db.js';

export default async function snapshotRoutes(fastify: FastifyInstance) {
  fastify.get('/api/snapshot', async () => {
    return getSnapshot();
  });

  fastify.get('/api/events', async (req) => {
    const query = req.query as { limit?: string };
    const limit = Math.min(parseInt(query.limit || '50', 10), 100);
    const rows = db.prepare(
      'SELECT * FROM runtime_events ORDER BY created_at DESC LIMIT ?'
    ).all(limit);
    return rows.map((row: any) => ({
      ...row,
      timestamp: row.created_at,
      raw: row.raw ? JSON.parse(row.raw) : undefined,
    }));
  });
}
