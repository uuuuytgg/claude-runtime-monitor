import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env');
  try {
    const raw = readFileSync(envPath, 'utf-8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  } catch {
    // .env is optional — env vars can come from system
  }
}
loadEnv();

const schema = z.object({
  DEEPSEEK_API_KEY: z.string().default(''),
  MONITOR_ACCESS_TOKEN: z.string().default(''),
  MONITOR_INTERNAL_TOKEN: z.string().default(''),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().default(4377),
  LAN_ENABLED: z.enum(['true', 'false']).default('false'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Config validation error:', JSON.stringify(parsed.error.flatten(), null, 2));
  process.exit(1);
}

function generateToken(): string {
  return 'crm_' + randomBytes(24).toString('base64url');
}

export const config = {
  deepseekApiKey: parsed.data.DEEPSEEK_API_KEY,
  host: parsed.data.HOST,
  port: parsed.data.PORT,
  lanEnabled: parsed.data.LAN_ENABLED === 'true',
  accessToken: parsed.data.MONITOR_ACCESS_TOKEN || generateToken(),
  internalToken: parsed.data.MONITOR_INTERNAL_TOKEN || generateToken(),
};

if (!process.env.MONITOR_ACCESS_TOKEN) {
  console.log(`[config] MONITOR_ACCESS_TOKEN auto-generated: ${config.accessToken.slice(0, 8)}...`);
}
if (!process.env.MONITOR_INTERNAL_TOKEN) {
  console.log(`[config] MONITOR_INTERNAL_TOKEN auto-generated: ${config.internalToken.slice(0, 8)}...`);
}
