import type { QuotaInfo } from '@crm/shared';

const DEEPSEEK_BASE = 'https://api.deepseek.com';

export interface BalanceResponse {
  is_available: boolean;
  balance_infos: Array<{
    currency: string;
    total_balance: string;
    granted_balance: string;
    topped_up_balance: string;
  }>;
}

export async function fetchBalance(apiKey: string): Promise<{ quota: QuotaInfo; raw: BalanceResponse }> {
  const res = await fetch(`${DEEPSEEK_BASE}/user/balance`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    if (res.status === 401) throw new QuotaError('Invalid DeepSeek API key', 401);
    if (res.status === 402) throw new QuotaError('DeepSeek account balance insufficient', 402);
    if (res.status === 429) throw new QuotaError('DeepSeek API rate limited', 429);
    throw new QuotaError(`DeepSeek API error: ${res.status}`, res.status);
  }

  const data: BalanceResponse = await res.json();
  const firstBalance = data.balance_infos?.[0];
  const balance = firstBalance?.total_balance ?? null;
  const status: QuotaInfo['status'] = !data.is_available
    ? 'error'
    : balance !== null && parseFloat(balance) <= 1.0
      ? 'critical'
      : balance !== null && parseFloat(balance) <= 10.0
        ? 'low'
        : 'ok';

  return {
    quota: {
      provider: 'deepseek',
      balance,
      status,
      lastUpdated: new Date().toISOString(),
      currency: firstBalance?.currency || 'CNY',
    },
    raw: data,
  };
}

export async function fetchBalanceWithRetry(
  apiKey: string,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<{ quota: QuotaInfo; raw: BalanceResponse }> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fetchBalance(apiKey);
    } catch (err) {
      lastError = err as Error;
      if (err instanceof QuotaError && err.statusCode === 401) throw err; // don't retry auth errors
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError ?? new Error('Unknown quota fetch error');
}

export class QuotaError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'QuotaError';
    this.statusCode = statusCode;
  }
}
