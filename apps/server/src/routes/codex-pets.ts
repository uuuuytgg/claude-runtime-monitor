import { FastifyInstance } from 'fastify';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const CODEX_PETS_DIR = join(process.env.USERPROFILE || '', '.codex', 'pets');

export default async function codexPetRoutes(fastify: FastifyInstance) {
  fastify.get('/api/codex-pets', async () => {
    const pets: Array<{ id: string; displayName: string; description: string }> = [];
    if (!existsSync(CODEX_PETS_DIR)) {
      return { pets, dir: CODEX_PETS_DIR, found: false };
    }
    try {
      const { readdirSync } = await import('fs');
      const dirs = readdirSync(CODEX_PETS_DIR, { withFileTypes: true });
      for (const d of dirs) {
        if (!d.isDirectory()) continue;
        const jsonPath = join(CODEX_PETS_DIR, d.name, 'pet.json');
        const sheetPath = join(CODEX_PETS_DIR, d.name, 'spritesheet.webp');
        if (!existsSync(jsonPath) || !existsSync(sheetPath)) continue;
        try {
          const raw = readFileSync(jsonPath, 'utf-8');
          const meta = JSON.parse(raw);
          pets.push({
            id: d.name,
            displayName: meta.displayName || d.name,
            description: meta.description || '',
          });
        } catch {}
      }
    } catch {}
    return { pets, dir: CODEX_PETS_DIR, found: true };
  });

  fastify.get('/api/codex-pets/:id/spritesheet', async (req, reply) => {
    const { id } = req.params as any;
    const sanitized = id.replace(/[^a-z0-9_-]/gi, '_');
    const sheetPath = join(CODEX_PETS_DIR, sanitized, 'spritesheet.webp');
    if (!existsSync(sheetPath)) {
      return reply.code(404).send({ error: 'pet not found' });
    }
    const img = readFileSync(sheetPath);
    reply.header('Content-Type', 'image/webp');
    reply.header('Cache-Control', 'public, max-age=3600');
    return reply.send(img);
  });
}
