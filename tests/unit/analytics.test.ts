// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { trackEvent, __resetPurchaseTrackingForTests } from '../../src/utils/analytics';

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
});
