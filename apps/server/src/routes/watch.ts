import { FastifyInstance } from 'fastify';
import { getSnapshot } from './internal.js';

export default async function watchRoutes(fastify: FastifyInstance) {
  fastify.get('/api/watch', async (_req, reply) => {
    const snap = getSnapshot();
    return reply.send({
      ok: true,
      state: snap.runtime.state,
      severity: snap.runtime.severity,
      model: snap.claude.model,
      contextUsed: snap.claude.contextUsed,
      cost: snap.claude.cost,
      sessionCostTotal: snap.claude.sessionCostTotal,
      quotaStatus: snap.quota.status,
      quotaBalance: snap.quota.balance,
      coreState: snap.animation.coreState,
      updated: snap.timestamp,
    });
  });
}
