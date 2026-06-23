import type { QuotaInfo } from '@crm/shared';

/**
 * Xiaomi Mimo — tries balance API first.
 * Returns null if the balance API is not available (caller should fall back to cc-switch usage tracking).
 */
export async function fetchMimoBalance(apiKey: string): Promise<{ quota: QuotaInfo; raw: any } | null> {
  try {
    const res = await fetch('https://api.xiaomimimo.com/v1/user/balance', {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const data = await res.json();
    let balance: string | null = null;

    // Try various response formats
    if (data.data?.available_balance !== undefined) balance = String(data.data.available_balance);
    else if (data.balance !== undefined) balance = String(data.balance);
    else if (data.data?.total_balance !== undefined) balance = String(data.data.total_balance);

    if (balance === null) return null;

    const val = parseFloat(balance);
    const status: QuotaInfo['status'] = val <= 0 ? 'error' : val <= 1 ? 'critical' : val <= 10 ? 'low' : 'ok';

    return {
      quota: { provider: 'xiaomi-mimo', balance, status, lastUpdated: new Date().toISOString(), currency: 'CNY' },
      raw: data,
    };
  } catch {
    return null;
  }
}

/** Mimo model pricing per million tokens (CNY) — official platform.xiaomimimo.com prices */
export const MIMO_PRICING: Record<string, { input: number; output: number; cacheRead: number }> = {
  'mimo-v2-flash':    { input: 1.0,   output: 2.0,  cacheRead: 0.02 },
  'mimo-v2-pro':      { input: 3.0,   output: 6.0,  cacheRead: 0.025 },
  'mimo-v2.5':        { input: 1.0,   output: 2.0,  cacheRead: 0.02 },
  'mimo-v2.5-pro':    { input: 3.0,   output: 6.0,  cacheRead: 0.025 },
};
