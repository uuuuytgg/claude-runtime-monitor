import type { QuotaInfo } from '@crm/shared';

export interface ProviderConfig {
  provider: string;
  apiKey: string;
  baseUrl?: string;
  balanceEndpoint?: string;
}

export interface GenericBalanceResult {
  balance: string | null;
  currency: string;
  raw: any;
}

/**
 * Fetch balance for a generic OpenAI-compatible provider.
 * Tries multiple common balance endpoint patterns.
 */
export async function fetchGenericBalance(config: ProviderConfig): Promise<{ quota: QuotaInfo; raw: any }> {
  const baseUrl = config.baseUrl || '';
  const endpoint = config.balanceEndpoint || '/user/balance';
  const url = baseUrl + endpoint;

  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Accept': 'application/json',
    },
  });

  if (!res.ok) {
    throw new GenericQuotaError(`${config.provider} API error: ${res.status}`, res.status);
  }

  const data = await res.json();

  // Try to extract balance from various response formats
  let balance: string | null = null;
  let currency = 'CNY';

  // Format 1: DeepSeek style { balance_infos: [{ total_balance, currency }] }
  if (data.balance_infos?.[0]) {
    balance = data.balance_infos[0].total_balance ?? null;
    currency = data.balance_infos[0].currency || 'CNY';
  }
  // Format 2: Simple { balance, currency }
  else if (data.balance !== undefined) {
    balance = String(data.balance);
    currency = data.currency || 'CNY';
  }
  // Format 3: { data: { total_balance } } (some providers)
  else if (data.data?.total_balance !== undefined) {
    balance = String(data.data.total_balance);
  }
  // Format 4: { total_available_balance }
  else if (data.total_available_balance !== undefined) {
    balance = String(data.total_available_balance);
  }
  // Format 5: Moonshot/Kimi style { data: { available_balance } }
  else if (data.data?.available_balance !== undefined) {
    balance = String(data.data.available_balance);
  }

  const status: QuotaInfo['status'] = balance !== null && parseFloat(balance) <= 0
    ? 'error'
    : balance !== null && parseFloat(balance) <= 1.0
      ? 'critical'
      : balance !== null && parseFloat(balance) <= 10.0
        ? 'low'
        : 'ok';

  return {
    quota: {
      provider: config.provider,
      balance,
      status,
      lastUpdated: new Date().toISOString(),
      currency,
    },
    raw: data,
  };
}

export async function fetchGenericBalanceWithRetry(
  config: ProviderConfig,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<{ quota: QuotaInfo; raw: any }> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fetchGenericBalance(config);
    } catch (err) {
      lastError = err as Error;
      if (err instanceof GenericQuotaError && err.statusCode === 401) throw err;
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError ?? new Error('Unknown quota fetch error');
}

export class GenericQuotaError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'GenericQuotaError';
    this.statusCode = statusCode;
  }
}
