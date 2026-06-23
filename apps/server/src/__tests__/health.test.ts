import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import healthRoutes from '../routes/health.js';

let fastify: ReturnType<typeof Fastify>;

beforeAll(async () => {
  fastify = Fastify();
  await fastify.register(healthRoutes);
  await fastify.listen({ port: 0 });
});

afterAll(async () => {
  await fastify.close();
});

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const res = await fetch(`http://127.0.0.1:${(fastify.server.address() as any).port}/api/health`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(typeof body.uptime).toBe('number');
  });
});
