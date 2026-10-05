// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  trackEvent,
  __resetPurchaseTrackingForTests,
  sanitizeSrc,
  normalizePaymentMethod,
  extractStripeSessionId,
  rememberPendingCheckout,
  getPendingCheckoutRefs,
  trackPurchaseForOrder,
  reconcilePendingPurchases,
  isPurchaseTracked,
} from '../../src/utils/analytics';

const w = window as unknown as Window & { gtag?: ReturnType<typeof vi.fn> };

describe('Analytics Helper', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetPurchaseTrackingForTests();
    w.gtag = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete w.gtag;
  });

  describe('trackEvent', () => {
    it('envia evento com parâmetros limpos', () => {
      trackEvent('view_pro', { logged_in: true, has_enough_dc: false });
      expect(w.gtag).toHaveBeenCalledTimes(1);
      expect(w.gtag).toHaveBeenCalledWith('event', 'view_pro', { logged_in: true, has_enough_dc: false });
    });

    it('remove parâmetros undefined', () => {
      trackEvent('view_pro', { src: undefined, logged_in: true });
      expect(w.gtag).toHaveBeenCalledWith('event', 'view_pro', { logged_in: true });
    });

    it('remove parâmetros null', () => {
      trackEvent('begin_checkout', { coupon: null, value: 49.90 });
      expect(w.gtag).toHaveBeenCalledWith('event', 'begin_checkout', { value: 49.90 });
    });

    it('nunca envia PII (email, username, cpf)', () => {
      trackEvent('sign_up', { email: 'test@example.com', username: 'user123', cpf: '12345678900', method: 'google' });
      expect(w.gtag).toHaveBeenCalledWith('event', 'sign_up', { method: 'google' });
    });

    it('não quebra se gtag não existir (adblock)', () => {
      delete w.gtag;
      expect(() => trackEvent('view_pro', { logged_in: true })).not.toThrow();
    });

    it('não quebra se gtag lançar erro', () => {
      w.gtag = vi.fn(() => { throw new Error('gtag error'); });
      expect(() => trackEvent('purchase', { transaction_id: '123', value: 49.90 })).not.toThrow();
    });

    it('não quebra se localStorage falhar', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      expect(() => trackEvent('purchase', { transaction_id: '123', value: 49.90 })).not.toThrow();
    });
  });

  describe('deduplicação de purchase', () => {
    it('dispara purchase apenas 1x para o mesmo transaction_id', () => {
      trackEvent('purchase', { transaction_id: 'order-123', value: 49.90, currency: 'BRL' });
      trackEvent('purchase', { transaction_id: 'order-123', value: 49.90, currency: 'BRL' });
      trackEvent('purchase', { transaction_id: 'order-123', value: 49.90, currency: 'BRL' });
      
      expect(w.gtag).toHaveBeenCalledTimes(1);
      expect(w.gtag).toHaveBeenCalledWith('event', 'purchase', {
        transaction_id: 'order-123',
        value: 49.90,
        currency: 'BRL',
      });
    });

    it('dispara purchase para transaction_ids diferentes', () => {
      trackEvent('purchase', { transaction_id: 'order-123', value: 49.90 });
      trackEvent('purchase', { transaction_id: 'order-456', value: 99.90 });
      
      expect(w.gtag).toHaveBeenCalledTimes(2);
    });

    it('não deduplica se transaction_id for undefined', () => {
      trackEvent('purchase', { value: 49.90, currency: 'BRL' });
      trackEvent('purchase', { value: 49.90, currency: 'BRL' });
      
      expect(w.gtag).toHaveBeenCalledTimes(2);
    });

    it('não deduplica eventos que não são purchase', () => {
      trackEvent('begin_checkout', { value: 49.90 });
      trackEvent('begin_checkout', { value: 49.90 });
      
      expect(w.gtag).toHaveBeenCalledTimes(2);
    });

    it('mantém até 100 transações rastreadas', () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      
      // Rastrear 101 transações
      for (let i = 1; i <= 101; i++) {
        trackEvent('purchase', { transaction_id: `order-${i}`, value: 1 });
      }
      
      expect(w.gtag).toHaveBeenCalledTimes(101);
      
      // A primeira transação deve ter sido removida da lista
      trackEvent('purchase', { transaction_id: 'order-1', value: 1 });
      expect(w.gtag).toHaveBeenCalledTimes(102); // Não deduplica porque foi removida
    });
  });

  describe('tipos de eventos', () => {
    it('view_pro com todos os parâmetros', () => {
      trackEvent('view_pro', { src: 'toast_route', logged_in: true, has_enough_dc: false });
      expect(w.gtag).toHaveBeenCalledWith('event', 'view_pro', {
        src: 'toast_route',
        logged_in: true,
        has_enough_dc: false,
      });
    });

    it('begin_checkout com PIX', () => {
      trackEvent('begin_checkout', {
        method: 'pix',
        package_dc: 1000,
        value: 49.90,
        currency: 'BRL',
        coupon: 'PROMO10',
        intent: 'dc',
      });
      expect(w.gtag).toHaveBeenCalledWith('event', 'begin_checkout', {
        method: 'pix',
        package_dc: 1000,
        value: 49.90,
        currency: 'BRL',
        coupon: 'PROMO10',
        intent: 'dc',
      });
    });

    it('purchase completo', () => {
      trackEvent('purchase', {
        transaction_id: 'order-123',
        value: 49.90,
        currency: 'BRL',
        method: 'pix',
        package_dc: 1000,
        coupon: 'PROMO10',
      });
      expect(w.gtag).toHaveBeenCalledWith('event', 'purchase', {
        transaction_id: 'order-123',
        value: 49.90,
        currency: 'BRL',
        method: 'pix',
        package_dc: 1000,
        coupon: 'PROMO10',
      });
    });

    it('pro_activated', () => {
      trackEvent('pro_activated', { plan_id: 'plan-monthly', price_dc: 500, src: 'expiry_reminder' });
      expect(w.gtag).toHaveBeenCalledWith('event', 'pro_activated', {
        plan_id: 'plan-monthly',
        price_dc: 500,
        src: 'expiry_reminder',
      });
    });

    it('pro_upsell_shown', () => {
      trackEvent('pro_upsell_shown', { placement: 'toast_route' });
      expect(w.gtag).toHaveBeenCalledWith('event', 'pro_upsell_shown', { placement: 'toast_route' });
    });

    it('tournament_join', () => {
      trackEvent('tournament_join', { entry_fee_dc: 100, is_weekly: true, free: false });
      expect(w.gtag).toHaveBeenCalledWith('event', 'tournament_join', {
        entry_fee_dc: 100,
        is_weekly: true,
        free: false,
      });
    });

    it('tournament_create', () => {
      trackEvent('tournament_create', { is_weekly: false, prize_pool_dc: 1000, entry_fee_dc: 50 });
      expect(w.gtag).toHaveBeenCalledWith('event', 'tournament_create', {
        is_weekly: false,
        prize_pool_dc: 1000,
        entry_fee_dc: 50,
      });
    });
  });
  describe('sanitização (PII e valores inválidos)', () => {
    it('descarta chaves que contêm email/cpf/phone/username, mesmo com prefixo', () => {
      trackEvent('view_pro', { user_email: 'a@b.com', owner_cpf: '1', contact_phone: '1', p_username: 'x', name: 'Fulano', plan_id: 'p1' });
      expect(w.gtag).toHaveBeenCalledWith('event', 'view_pro', { plan_id: 'p1' });
    });

    it('descarta valores com cara de e-mail ou CPF mesmo com chave inocente (?src=)', () => {
      trackEvent('view_pro', { src: 'fulano@gmail.com', coupon: '123.456.789-09', other: '12345678909', ok: 'toast_route' });
      expect(w.gtag).toHaveBeenCalledWith('event', 'view_pro', { ok: 'toast_route' });
    });

    it('descarta números não finitos (NaN de parseInt vazio)', () => {
      trackEvent('tournament_create', { prize_pool_dc: NaN, entry_fee_dc: Infinity, is_weekly: false });
      expect(w.gtag).toHaveBeenCalledWith('event', 'tournament_create', { is_weekly: false });
    });

    it('sanitizeSrc aceita só identificadores curtos', () => {
      expect(sanitizeSrc('toast_route')).toBe('toast_route');
      expect(sanitizeSrc(' Expiry_Reminder ')).toBe('expiry_reminder');
      expect(sanitizeSrc('fulano@gmail.com')).toBeUndefined();
      expect(sanitizeSrc('<script>')).toBeUndefined();
      expect(sanitizeSrc('a'.repeat(41))).toBeUndefined();
      expect(sanitizeSrc(null)).toBeUndefined();
      expect(sanitizeSrc('')).toBeUndefined();
    });
  });

  describe('dedupe robusto de purchase', () => {
    it('não marca como enviado se o gtag lançar (a próxima tentativa envia)', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      w.gtag = vi.fn(() => { throw new Error('boom'); });
      expect(trackEvent('purchase', { transaction_id: 'o-1', value: 10 })).toBe(false);
      expect(isPurchaseTracked('o-1')).toBe(false);
      w.gtag = vi.fn();
      expect(trackEvent('purchase', { transaction_id: 'o-1', value: 10 })).toBe(true);
      expect(trackEvent('purchase', { transaction_id: 'o-1', value: 10 })).toBe(false);
      expect(w.gtag).toHaveBeenCalledTimes(1);
    });

    it('sem gtag não marca (adblock): quando o gtag existir, ainda envia', () => {
      delete w.gtag;
      expect(trackEvent('purchase', { transaction_id: 'o-2', value: 10 })).toBe(false);
      expect(isPurchaseTracked('o-2')).toBe(false);
    });

    it('deduplica transaction_id numérico', () => {
      trackEvent('purchase', { transaction_id: 42, value: 1 });
      trackEvent('purchase', { transaction_id: '42', value: 1 });
      expect(w.gtag).toHaveBeenCalledTimes(1);
    });

    it('sobrevive a reload / outra aba (estado só no localStorage)', async () => {
      trackEvent('purchase', { transaction_id: 'o-3', value: 1 });
      vi.resetModules();
      const fresh = await import('../../src/utils/analytics');
      expect(fresh.trackEvent('purchase', { transaction_id: 'o-3', value: 1 })).toBe(false);
      expect(w.gtag).toHaveBeenCalledTimes(1);
    });
  });

  describe('helpers do funil', () => {
    it('normalizePaymentMethod mapeia o que o webhook grava', () => {
      expect(normalizePaymentMethod('pix')).toBe('pix');
      expect(normalizePaymentMethod('stripe')).toBe('stripe');
      expect(normalizePaymentMethod('card')).toBe('card');
      expect(normalizePaymentMethod('visa')).toBe('card');
      expect(normalizePaymentMethod('account_money')).toBe('card');
      expect(normalizePaymentMethod(null, 'pix')).toBe('pix');
    });

    it('extractStripeSessionId lê o id da Checkout Session da URL', () => {
      expect(extractStripeSessionId('https://checkout.stripe.com/c/pay/cs_live_a1B2c3#fidkdWxOYHwnPyd1blpxYHZxWjA0')).toBe('cs_live_a1B2c3');
      expect(extractStripeSessionId('https://checkout.stripe.com/c/pay/cs_test_XYZ')).toBe('cs_test_XYZ');
      expect(extractStripeSessionId('https://example.com/x')).toBeNull();
      expect(extractStripeSessionId(undefined)).toBeNull();
    });

    it('rememberPendingCheckout ignora ref vazia e expira após 7 dias', () => {
      rememberPendingCheckout(null, 'stripe');
      rememberPendingCheckout('', 'card');
      expect(getPendingCheckoutRefs()).toEqual([]);
      const t0 = Date.now();
      rememberPendingCheckout(123, 'pix', t0);
      expect(getPendingCheckoutRefs(t0)).toEqual(['123']);
      expect(getPendingCheckoutRefs(t0 + 8 * 24 * 60 * 60 * 1000)).toEqual([]);
    });

    it('rememberPendingCheckout nunca lança (caminho do pagamento)', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded'); });
      expect(() => rememberPendingCheckout('x', 'pix')).not.toThrow();
    });

    const paidOrder = {
      id: 'ord-1', status: 'paid', amount_brl: '19.90', duelcoins_amount: 500,
      coupon_code: null, payment_method: 'visa', external_order_id: 'pref-1',
    };

    it('trackPurchaseForOrder só dispara para pedido paid, com valores do pedido', () => {
      expect(trackPurchaseForOrder({ ...paidOrder, status: 'pending' })).toBe(false);
      expect(trackPurchaseForOrder(null)).toBe(false);
      expect(w.gtag).not.toHaveBeenCalled();

      rememberPendingCheckout('pref-1', 'card');
      expect(trackPurchaseForOrder(paidOrder)).toBe(true);
      expect(w.gtag).toHaveBeenCalledWith('event', 'purchase', {
        transaction_id: 'ord-1', value: 19.9, currency: 'BRL', method: 'card', package_dc: 500,
      });
      expect(getPendingCheckoutRefs()).toEqual([]);
      expect(trackPurchaseForOrder(paidOrder)).toBe(false);
      expect(w.gtag).toHaveBeenCalledTimes(1);
    });
  });

  describe('reconcilePendingPurchases', () => {
    type Row = { id: string; status: string; amount_brl: number; duelcoins_amount: number; coupon_code: string | null; payment_method: string | null; external_order_id: string; user_id: string };

    function fakeClient(rowsByCall: Row[][] | (() => Row[])) {
      const calls: { eq: [string, unknown][]; inArg: [string, string[]] | null; select: string }[] = [];
      let n = 0;
      const client = {
        from: vi.fn((table: string) => {
          expect(table).toBe('duelcoins_orders');
          const call = { eq: [] as [string, unknown][], inArg: null as [string, string[]] | null, select: '' };
          calls.push(call);
          const builder = {
            select(cols: string) { call.select = cols; return builder; },
            eq(col: string, v: unknown) { call.eq.push([col, v]); return builder; },
            in(col: string, vals: string[]) {
              call.inArg = [col, vals];
              const rows = typeof rowsByCall === 'function' ? rowsByCall() : rowsByCall[Math.min(n, rowsByCall.length - 1)];
              n++;
              const uid = call.eq.find(([c]) => c === 'user_id')?.[1];
              return Promise.resolve({ data: rows.filter((r) => r.user_id === uid && vals.includes(r.external_order_id)), error: null });
            },
          };
          return builder;
        }),
      };
      return { client, calls };
    }

    const row = (over: Partial<Row>): Row => ({
      id: 'ord-1', status: 'pending', amount_brl: 49.9, duelcoins_amount: 1000, coupon_code: 'PROMO10',
      payment_method: 'pix', external_order_id: 'mp-1', user_id: 'u1', ...over,
    });
    const noSleep = () => Promise.resolve();

    it('sem checkout pendente não faz nenhuma consulta', async () => {
      const { client } = fakeClient([[row({ status: 'paid' })]]);
      expect(await reconcilePendingPurchases(client, 'u1')).toBe(0);
      expect(client.from).not.toHaveBeenCalled();
      expect(w.gtag).not.toHaveBeenCalled();
    });

    it('espera o webhook: dispara 1x quando o pedido vira paid', async () => {
      rememberPendingCheckout('mp-1', 'pix');
      const { client, calls } = fakeClient([[row({})], [row({})], [row({ status: 'paid' })]]);
      expect(await reconcilePendingPurchases(client, 'u1', { attempts: 5, sleep: noSleep })).toBe(1);
      expect(calls).toHaveLength(3); // para assim que não há mais pendência
      expect(calls[0].eq).toContainEqual(['user_id', 'u1']);
      expect(calls[0].inArg).toEqual(['external_order_id', ['mp-1']]);
      expect(calls[0].select).not.toMatch(/\*/);
      expect(w.gtag).toHaveBeenCalledTimes(1);
      expect(w.gtag).toHaveBeenCalledWith('event', 'purchase', {
        transaction_id: 'ord-1', value: 49.9, currency: 'BRL', method: 'pix', package_dc: 1000, coupon: 'PROMO10',
      });
      // reload / outra aba: nada pendente, nada duplicado
      expect(await reconcilePendingPurchases(client, 'u1', { attempts: 5, sleep: noSleep })).toBe(0);
      expect(w.gtag).toHaveBeenCalledTimes(1);
    });

    it('nunca atribui pedido pago que não foi iniciado neste navegador', async () => {
      rememberPendingCheckout('cs_live_new', 'stripe');
      const { client } = fakeClient([[
        row({ id: 'old', status: 'paid', external_order_id: 'cs_live_old' }),
        row({ id: 'new', status: 'pending', external_order_id: 'cs_live_new', payment_method: 'stripe' }),
      ]]);
      expect(await reconcilePendingPurchases(client, 'u1', { attempts: 3, sleep: noSleep })).toBe(0);
      expect(w.gtag).not.toHaveBeenCalled();
    });

    it('não dispara para pedido de outro usuário', async () => {
      rememberPendingCheckout('mp-1', 'pix');
      const { client } = fakeClient([[row({ status: 'paid', user_id: 'u2' })]]);
      expect(await reconcilePendingPurchases(client, 'u1')).toBe(0);
      expect(w.gtag).not.toHaveBeenCalled();
    });

    it('esquece pendências que terminaram sem pagamento', async () => {
      rememberPendingCheckout('mp-1', 'pix');
      const { client, calls } = fakeClient([[row({ status: 'cancelled' })]]);
      expect(await reconcilePendingPurchases(client, 'u1', { attempts: 5, sleep: noSleep })).toBe(0);
      expect(calls).toHaveLength(1);
      expect(getPendingCheckoutRefs()).toEqual([]);
    });

    it('para quando abortado (unmount) e não rejeita em erro', async () => {
      rememberPendingCheckout('mp-1', 'pix');
      const ctrl = new AbortController();
      ctrl.abort();
      const { client } = fakeClient([[row({ status: 'paid' })]]);
      expect(await reconcilePendingPurchases(client, 'u1', { signal: ctrl.signal })).toBe(0);
      expect(client.from).not.toHaveBeenCalled();

      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const broken = { from: () => { throw new Error('network'); } };
      await expect(reconcilePendingPurchases(broken, 'u1')).resolves.toBe(0);
    });
  });
});
