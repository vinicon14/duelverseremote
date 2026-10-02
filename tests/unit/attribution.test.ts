// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  captureAttribution,
  getAttribution,
  clearAttribution,
  recordSignupAttribution,
  __resetAttributionStateForTests,
  type AttributionData,
} from '../../src/utils/attribution';

const DAY = 24 * 60 * 60 * 1000;
const w = window as unknown as Window & { gtag?: ReturnType<typeof vi.fn> };

function setUrl(pathAndQuery: string) {
  window.history.replaceState({}, '', pathAndQuery);
}

function setReferrer(value: string) {
  Object.defineProperty(document, 'referrer', { value, writable: true, configurable: true });
}

function mockClient(...results: Array<{ data: unknown; error: unknown }>) {
  const rpc = vi.fn();
  for (const r of results) rpc.mockResolvedValueOnce(r);
  rpc.mockResolvedValue(results[results.length - 1] ?? { data: false, error: null });
  return { rpc };
}

const newUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'u1',
  created_at: new Date(Date.now() - 60_000).toISOString(),
  app_metadata: { provider: 'email' },
  ...overrides,
});

describe('Attribution Utils', () => {
  beforeEach(() => {
    localStorage.clear();
    setUrl('/comece');
    setReferrer('');
    __resetAttributionStateForTests();
    w.gtag = vi.fn();
  });

  afterEach(() => {
    clearAttribution();
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete w.gtag;
  });

  describe('captureAttribution', () => {
    it('captura UTM da URL', () => {
      setUrl('/comece?utm_source=google&utm_medium=cpc&utm_campaign=summer2026&utm_content=ad1');
      captureAttribution();
      const attr = getAttribution();
      expect(attr?.utm_source).toBe('google');
      expect(attr?.utm_medium).toBe('cpc');
      expect(attr?.utm_campaign).toBe('summer2026');
      expect(attr?.utm_content).toBe('ad1');
      expect(attr?.landing_path).toBe('/comece');
      expect(attr?.ts).toBeGreaterThan(0);
    });

    it('captura ref', () => {
      setUrl('/?ref=influencer123');
      captureAttribution();
      expect(getAttribution()?.ref).toBe('influencer123');
    });

    it('guarda só o host do referrer externo (sem caminho/query)', () => {
      setReferrer('https://www.reddit.com/r/yugioh?secret=1');
      captureAttribution();
      const attr = getAttribution();
      expect(attr?.utm_source).toBeUndefined();
      expect(attr?.referrer).toBe('reddit.com');
    });

    it('ignora referrer interno', () => {
      setReferrer(`${window.location.origin}/landing`);
      captureAttribution();
      expect(getAttribution()).toBeNull();
    });

    it.each([
      'https://accounts.google.com/',
      'https://abcdxyz.supabase.co/auth/v1/callback',
      'https://duelverse.site/en/',
      'https://www.duelverse.site/',
      'https://duelverse.lovable.app/',
    ])('ignora referrer do fluxo de login / próprio site: %s', (ref) => {
      setReferrer(ref);
      captureAttribution();
      expect(getAttribution()).toBeNull();
    });

    it('first-touch: não sobrescreve atribuição existente', () => {
      setUrl('/?utm_source=facebook');
      captureAttribution();
      setUrl('/?utm_source=google');
      captureAttribution();
      expect(getAttribution()?.utm_source).toBe('facebook');
    });

    it('retorno do Google OAuth não sobrescreve a origem original', () => {
      setUrl('/?utm_source=tiktok');
      captureAttribution();
      setUrl('/');
      setReferrer('https://accounts.google.com/');
      captureAttribution();
      expect(getAttribution()?.utm_source).toBe('tiktok');
      expect(getAttribution()?.referrer).toBeUndefined();
    });

    it('sanitiza: trim e limite de 100', () => {
      setUrl(`/?utm_source=${encodeURIComponent('  ' + 'a'.repeat(200) + '  ')}&utm_medium=${encodeURIComponent(' email ')}`);
      captureAttribution();
      const attr = getAttribution();
      expect(attr?.utm_source).toBe('a'.repeat(100));
      expect(attr?.utm_medium).toBe('email');
    });

    it('remove caracteres não imprimíveis', () => {
      setUrl(`/?utm_source=${encodeURIComponent('test\x00\x01\x1Fvalue')}&utm_medium=${encodeURIComponent('em\x7Fail')}`);
      captureAttribution();
      const attr = getAttribution();
      expect(attr?.utm_source).toBe('testvalue');
      expect(attr?.utm_medium).toBe('email');
    });

    it('ignora campos vazios', () => {
      setUrl('/?utm_source=%20%20&utm_medium=cpc');
      captureAttribution();
      expect(getAttribution()?.utm_source).toBeUndefined();
      expect(getAttribution()?.utm_medium).toBe('cpc');
    });

    it('não salva nada sem UTM, ref ou referrer externo', () => {
      captureAttribution();
      expect(getAttribution()).toBeNull();
    });

    it('não lança se localStorage.setItem falhar', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      setUrl('/?utm_source=google');
      expect(() => captureAttribution()).not.toThrow();
    });

    it('não lança se localStorage.getItem falhar', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      expect(() => getAttribution()).not.toThrow();
      expect(getAttribution()).toBeNull();
    });
  });

  describe('getAttribution', () => {
    it('null sem atribuição', () => {
      expect(getAttribution()).toBeNull();
    });

    it('expira após 30 dias e limpa o storage', () => {
      const expired: AttributionData = { utm_source: 'google', ts: Date.now() - 31 * DAY };
      localStorage.setItem('dv_attribution', JSON.stringify(expired));
      expect(getAttribution()).toBeNull();
      expect(localStorage.getItem('dv_attribution')).toBeNull();
    });

    it('válida antes de 30 dias', () => {
      localStorage.setItem('dv_attribution', JSON.stringify({ utm_source: 'google', ts: Date.now() - 15 * DAY }));
      expect(getAttribution()?.utm_source).toBe('google');
    });

    it('null para JSON inválido ou formato inesperado', () => {
      localStorage.setItem('dv_attribution', 'invalid json');
      expect(getAttribution()).toBeNull();
      localStorage.setItem('dv_attribution', '"str"');
      expect(getAttribution()).toBeNull();
    });

    it('permite nova captura após expiração', () => {
      localStorage.setItem('dv_attribution', JSON.stringify({ utm_source: 'facebook', ts: Date.now() - 31 * DAY }));
      setUrl('/?utm_source=google');
      captureAttribution();
      expect(getAttribution()?.utm_source).toBe('google');
    });
  });

  describe('recordSignupAttribution', () => {
    it('envia a atribuição, dispara gtag sign_up só com true e limpa o storage', async () => {
      setUrl('/comece?utm_source=tiktok&utm_medium=social&utm_campaign=c1&utm_content=v1&ref=abc');
      captureAttribution();
      const client = mockClient({ data: true, error: null });

      await expect(recordSignupAttribution(client, newUser({ app_metadata: { provider: 'google' } }))).resolves.toBe(true);

      expect(client.rpc).toHaveBeenCalledTimes(1);
      expect(client.rpc).toHaveBeenCalledWith('record_signup_attribution', {
        p_source: 'tiktok', p_medium: 'social', p_campaign: 'c1', p_content: 'v1',
        p_ref: 'abc', p_referrer: null, p_landing: '/comece',
      });
      expect(w.gtag).toHaveBeenCalledTimes(1);
      expect(w.gtag).toHaveBeenCalledWith('event', 'sign_up', expect.objectContaining({
        method: 'google', source: 'tiktok', medium: 'social', campaign: 'c1', content: 'v1', ref: 'abc',
      }));
      expect(getAttribution()).toBeNull();
    });

    it('não dispara gtag quando a RPC retorna false', async () => {
      const client = mockClient({ data: false, error: null });
      await expect(recordSignupAttribution(client, newUser())).resolves.toBe(false);
      expect(w.gtag).not.toHaveBeenCalled();
    });

    it('não dispara gtag e não rejeita em erro da RPC', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const client = mockClient({ data: null, error: { message: 'boom' } });
      await expect(recordSignupAttribution(client, newUser())).resolves.toBe(false);
      expect(w.gtag).not.toHaveBeenCalled();
    });

    it('não rejeita se o client lançar', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const client = { rpc: vi.fn().mockRejectedValue(new Error('network')) };
      await expect(recordSignupAttribution(client, newUser())).resolves.toBe(false);
    });

    it('uma RPC por usuário por carregamento (TOKEN_REFRESHED, getSession duplicado...)', async () => {
      const client = mockClient({ data: false, error: null });
      const user = newUser();
      await Promise.all([
        recordSignupAttribution(client, user),
        recordSignupAttribution(client, user),
      ]);
      await recordSignupAttribution(client, user);
      expect(client.rpc).toHaveBeenCalledTimes(1);
    });

    it('não chama a RPC para contas antigas (> ~24h) nem sem usuário', async () => {
      const client = mockClient({ data: true, error: null });
      await expect(recordSignupAttribution(client, newUser({ created_at: new Date(Date.now() - 3 * DAY).toISOString() }))).resolves.toBe(false);
      await expect(recordSignupAttribution(client, null)).resolves.toBe(false);
      expect(client.rpc).not.toHaveBeenCalled();
    });

    it('tenta de novo quando o perfil ainda não existe (RPC retorna null)', async () => {
      vi.useFakeTimers();
      const client = mockClient(
        { data: null, error: null },
        { data: true, error: null },
      );
      const p = recordSignupAttribution(client, newUser());
      await vi.runAllTimersAsync();
      await expect(p).resolves.toBe(true);
      expect(client.rpc).toHaveBeenCalledTimes(2);
      expect(w.gtag).toHaveBeenCalledTimes(1);
    });

    it('desiste após as tentativas se o perfil nunca aparecer', async () => {
      vi.useFakeTimers();
      const client = mockClient({ data: null, error: null });
      const p = recordSignupAttribution(client, newUser());
      await vi.runAllTimersAsync();
      await expect(p).resolves.toBe(false);
      expect(client.rpc).toHaveBeenCalledTimes(3);
      expect(w.gtag).not.toHaveBeenCalled();
    });

    it('origem por referrer: source = host, medium = referral', async () => {
      setReferrer('https://www.youtube.com/watch?v=x');
      captureAttribution();
      const client = mockClient({ data: true, error: null });
      await recordSignupAttribution(client, newUser());
      expect(client.rpc).toHaveBeenCalledWith('record_signup_attribution', expect.objectContaining({ p_referrer: 'youtube.com', p_source: null }));
      expect(w.gtag).toHaveBeenCalledWith('event', 'sign_up', expect.objectContaining({ source: 'youtube.com', medium: 'referral', method: 'email' }));
    });

    it('sem atribuição: gtag com source direct', async () => {
      const client = mockClient({ data: true, error: null });
      await recordSignupAttribution(client, newUser());
      expect(w.gtag).toHaveBeenCalledWith('event', 'sign_up', expect.objectContaining({ source: 'direct' }));
    });

    it('funciona sem gtag carregado (adblock)', async () => {
      delete w.gtag;
      const client = mockClient({ data: true, error: null });
      await expect(recordSignupAttribution(client, newUser())).resolves.toBe(true);
    });
  });
});
