import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  captureAttribution,
  getAttribution,
  clearAttribution,
  type AttributionData,
} from '../../src/utils/attribution';

describe('Attribution Utils', () => {
  beforeEach(() => {
    // Limpar localStorage
    localStorage.clear();
    
    // Mock de window.location
    delete (window as any).location;
    (window as any).location = {
      hostname: 'duelverse.com',
      pathname: '/comece',
      search: '',
    };
    
    // Mock de document.referrer
    Object.defineProperty(document, 'referrer', {
      writable: true,
      configurable: true,
      value: '',
    });
  });

  afterEach(() => {
    clearAttribution();
  });

  describe('captureAttribution', () => {
    it('deve capturar UTM parameters da URL', () => {
      (window as any).location.search = '?utm_source=google&utm_medium=cpc&utm_campaign=summer2026&utm_content=ad1';
      
      captureAttribution();
      
      const attr = getAttribution();
      expect(attr).toBeTruthy();
      expect(attr?.utm_source).toBe('google');
      expect(attr?.utm_medium).toBe('cpc');
      expect(attr?.utm_campaign).toBe('summer2026');
      expect(attr?.utm_content).toBe('ad1');
      expect(attr?.landing_path).toBe('/comece');
      expect(attr?.ts).toBeGreaterThan(0);
    });

    it('deve capturar parâmetro ref', () => {
      (window as any).location.search = '?ref=influencer123';
      
      captureAttribution();
      
      const attr = getAttribution();
      expect(attr).toBeTruthy();
      expect(attr?.ref).toBe('influencer123');
    });

    it('deve capturar referrer externo', () => {
      Object.defineProperty(document, 'referrer', {
        value: 'https://google.com/search',
        writable: true,
        configurable: true,
      });
      
      captureAttribution();
      
      const attr = getAttribution();
      expect(attr).toBeTruthy();
      expect(attr?.referrer).toBe('https://google.com/search');
    });

    it('NÃO deve capturar referrer interno', () => {
      Object.defineProperty(document, 'referrer', {
        value: 'https://duelverse.com/landing',
        writable: true,
        configurable: true,
      });
      
      captureAttribution();
      
      const attr = getAttribution();
      expect(attr).toBeNull(); // Sem UTM e referrer interno = nada capturado
    });

    it('NÃO deve sobrescrever atribuição existente (first-touch)', () => {
      // Primeira captura
      (window as any).location.search = '?utm_source=facebook';
      captureAttribution();
      
      const first = getAttribution();
      expect(first?.utm_source).toBe('facebook');
      
      // Tentar capturar novamente com outra fonte
      (window as any).location.search = '?utm_source=google';
      captureAttribution();
      
      const second = getAttribution();
      expect(second?.utm_source).toBe('facebook'); // Mantém o primeiro
    });

    it('deve sanitizar campos: trim e limitar tamanho', () => {
      const longString = 'a'.repeat(200);
      (window as any).location.search = `?utm_source=  ${longString}  &utm_medium=email`;
      
      captureAttribution();
      
      const attr = getAttribution();
      expect(attr?.utm_source).toBe('a'.repeat(100)); // Máximo 100 chars
      expect(attr?.utm_medium).toBe('email'); // Trim aplicado
    });

    it('deve remover caracteres não-imprimíveis', () => {
      (window as any).location.search = '?utm_source=test\x00\x01\x1Fvalue&utm_medium=em\x7Fail';
      
      captureAttribution();
      
      const attr = getAttribution();
      expect(attr?.utm_source).toBe('testvalue');
      expect(attr?.utm_medium).toBe('email');
    });

    it('deve ignorar campos vazios ou só com espaços', () => {
      (window as any).location.search = '?utm_source=  &utm_medium=cpc';
      
      captureAttribution();
      
      const attr = getAttribution();
      expect(attr?.utm_source).toBeUndefined();
      expect(attr?.utm_medium).toBe('cpc');
    });

    it('NÃO deve salvar nada se não houver UTM, ref ou referrer externo', () => {
      (window as any).location.search = '';
      Object.defineProperty(document, 'referrer', { value: '', writable: true, configurable: true });
      
      captureAttribution();
      
      const attr = getAttribution();
      expect(attr).toBeNull();
    });
  });

  describe('getAttribution', () => {
    it('deve retornar null se não houver atribuição salva', () => {
      const attr = getAttribution();
      expect(attr).toBeNull();
    });

    it('deve retornar null se a atribuição expirou (> 30 dias)', () => {
      const expiredTs = Date.now() - (31 * 24 * 60 * 60 * 1000); // 31 dias atrás
      const expiredData: AttributionData = {
        utm_source: 'google',
        ts: expiredTs,
      };
      localStorage.setItem('dv_attribution', JSON.stringify(expiredData));
      
      const attr = getAttribution();
      expect(attr).toBeNull();
      
      // Deve limpar o localStorage
      expect(localStorage.getItem('dv_attribution')).toBeNull();
    });

    it('deve retornar dados válidos se não expirou (< 30 dias)', () => {
      const validTs = Date.now() - (15 * 24 * 60 * 60 * 1000); // 15 dias atrás
      const validData: AttributionData = {
        utm_source: 'google',
        utm_medium: 'cpc',
        ts: validTs,
      };
      localStorage.setItem('dv_attribution', JSON.stringify(validData));
      
      const attr = getAttribution();
      expect(attr).toBeTruthy();
      expect(attr?.utm_source).toBe('google');
      expect(attr?.utm_medium).toBe('cpc');
    });

    it('deve retornar null se o JSON salvo for inválido', () => {
      localStorage.setItem('dv_attribution', 'invalid json');
      
      const attr = getAttribution();
      expect(attr).toBeNull();
    });
  });

  describe('clearAttribution', () => {
    it('deve limpar a atribuição salva', () => {
      (window as any).location.search = '?utm_source=google';
      captureAttribution();
      
      expect(getAttribution()).toBeTruthy();
      
      clearAttribution();
      
      expect(getAttribution()).toBeNull();
    });
  });

  describe('First-touch com 30 dias de validade', () => {
    it('deve manter first-touch enquanto não expirar', () => {
      // Primeira visita
      (window as any).location.search = '?utm_source=facebook';
      captureAttribution();
      
      // Simular 20 dias depois
      const attr = getAttribution();
      if (attr) {
        attr.ts = Date.now() - (20 * 24 * 60 * 60 * 1000);
        localStorage.setItem('dv_attribution', JSON.stringify(attr));
      }
      
      // Segunda visita com outra fonte (não deve sobrescrever)
      (window as any).location.search = '?utm_source=google';
      captureAttribution();
      
      const final = getAttribution();
      expect(final?.utm_source).toBe('facebook');
    });

    it('deve permitir nova captura após expiração', () => {
      // Primeira visita
      (window as any).location.search = '?utm_source=facebook';
      captureAttribution();
      
      // Simular expiração (31 dias)
      const attr = getAttribution();
      if (attr) {
        attr.ts = Date.now() - (31 * 24 * 60 * 60 * 1000);
        localStorage.setItem('dv_attribution', JSON.stringify(attr));
      }
      
      // getAttribution deve retornar null e limpar
      expect(getAttribution()).toBeNull();
      
      // Nova visita deve ser capturada
      (window as any).location.search = '?utm_source=google';
      captureAttribution();
      
      const final = getAttribution();
      expect(final?.utm_source).toBe('google');
    });
  });

  describe('Fallback de referrer para cadastros diretos', () => {
    it('deve capturar apenas referrer externo quando não houver UTM', () => {
      (window as any).location.search = '';
      Object.defineProperty(document, 'referrer', {
        value: 'https://reddit.com/r/yugioh',
        writable: true,
        configurable: true,
      });
      
      captureAttribution();
      
      const attr = getAttribution();
      expect(attr).toBeTruthy();
      expect(attr?.utm_source).toBeUndefined();
      expect(attr?.referrer).toBe('https://reddit.com/r/yugioh');
    });
  });

  describe('Proteção contra localStorage desabilitado (modo privado)', () => {
    it('deve falhar silenciosamente se localStorage.setItem lançar exceção', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      
      (window as any).location.search = '?utm_source=google';
      
      // Não deve lançar exceção
      expect(() => captureAttribution()).not.toThrow();
    });

    it('deve falhar silenciosamente se localStorage.getItem lançar exceção', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      
      // Não deve lançar exceção
      expect(() => getAttribution()).not.toThrow();
      expect(getAttribution()).toBeNull();
    });
  });
});
