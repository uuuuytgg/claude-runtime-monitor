import { FastifyInstance } from 'fastify';

const clients = new Set<WebSocket>();

export function broadcast(data: object) {
  const payload = JSON.stringify(data);
  for (const ws of clients) {
    try { ws.send(payload); } catch { clients.delete(ws); }
  }
}

export default async function wsRoutes(fastify: FastifyInstance) {
  fastify.get('/ws', { websocket: true }, (socket, req) => {
    clients.add(socket);
    socket.on('close', () => clients.delete(socket));
    socket.on('error', () => clients.delete(socket));
  });
}

export function getClientCount(): number {
  return clients.size;
}
