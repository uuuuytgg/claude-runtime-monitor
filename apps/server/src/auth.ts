import { FastifyRequest, FastifyReply } from 'fastify';
import { config } from './config.js';

function isLocalhost(req: FastifyRequest): boolean {
  const ip = req.ip;
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

export async function authApi(req: FastifyRequest, reply: FastifyReply) {
  // Localhost always bypasses auth
  if (isLocalhost(req)) return;
  // In non-LAN mode, reject all non-localhost
  if (!config.lanEnabled) {
    return reply.code(403).send({ error: 'remote access disabled — enable LAN_ENABLED to allow' });
  }
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (token !== config.accessToken) {
    return reply.code(401).send({ error: 'unauthorized' });
  }
}

export function authInternal(req: FastifyRequest): boolean {
  if (isLocalhost(req)) return true;
  const token = req.headers['x-monitor-internal-token'] as string;
  return token === config.internalToken;
}
