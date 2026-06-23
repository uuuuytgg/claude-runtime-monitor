import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchBalance, QuotaError } from './deepseek.js';

describe('fetchBalance', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('parses valid balance response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        is_available: true,
        balance_infos: [{ currency: 'CNY', total_balance: '50.00', granted_balance: '0', topped_up_balance: '50.00' }],
      }),
    } as Response);

    const { quota } = await fetchBalance('sk-test');
    expect(quota.provider).toBe('deepseek');
    expect(quota.balance).toBe('50.00');
    expect(quota.status).toBe('ok');
    expect(quota.currency).toBe('CNY');
  });

  it('maps 401 to QuotaError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    await expect(fetchBalance('bad-key')).rejects.toThrow(QuotaError);
  });

  it('maps low balance to critical status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        is_available: true,
        balance_infos: [{ currency: 'CNY', total_balance: '0.50', granted_balance: '0', topped_up_balance: '0.50' }],
      }),
    } as Response);

    const { quota } = await fetchBalance('sk-test');
    expect(quota.status).toBe('critical');
  });

  it('maps low balance to low status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        is_available: true,
        balance_infos: [{ currency: 'CNY', total_balance: '8.00', granted_balance: '0', topped_up_balance: '8.00' }],
      }),
    } as Response);

    const { quota } = await fetchBalance('sk-test');
    expect(quota.status).toBe('low');
  });

  it('marks unavailable account as error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        is_available: false,
        balance_infos: [{ currency: 'CNY', total_balance: '100.00', granted_balance: '0', topped_up_balance: '100.00' }],
      }),
    } as Response);

    const { quota } = await fetchBalance('sk-test');
    expect(quota.status).toBe('error');
  });
});
