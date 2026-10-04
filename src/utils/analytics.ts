/**
 * Helper unificado para eventos GA4 no DuelVerse
 *
 * Convenções:
 * - Sempre try/catch (nunca quebrar o app)
 * - Remove params undefined/null
 * - Nunca envia PII (email, username, CPF, etc.)
 * - currency: 'BRL' quando houver value
 *
 * Uso:
 *   trackEvent('purchase', { transaction_id: orderId, value: 49.90, currency: 'BRL' })
 */

const PII_KEYS = ['email', 'username', 'cpf', 'name', 'phone'];

interface EventParams {
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Deduplicação de purchase via localStorage
 */
const PURCHASE_KEY = 'dv_tracked_purchases';

function isTransactionTracked(transactionId: string): boolean {
  try {
    const raw = localStorage.getItem(PURCHASE_KEY);
    if (!raw) return false;
    const set = new Set<string>(JSON.parse(raw));
    return set.has(transactionId);
  } catch {
    return false;
  }
}

function markTransactionTracked(transactionId: string): void {
  try {
    const raw = localStorage.getItem(PURCHASE_KEY);
    const set = new Set<string>(raw ? JSON.parse(raw) : []);
    set.add(transactionId);
    // Mantém até 100 transações (limpa antigas)
    const arr = Array.from(set);
    if (arr.length > 100) arr.splice(0, arr.length - 100);
    localStorage.setItem(PURCHASE_KEY, JSON.stringify(arr));
  } catch {
    // Falha silenciosa em modo privado / erro de storage
  }
}

/**
 * Remove undefined, null e PII dos parâmetros
 */
function cleanParams(params: EventParams | undefined): Record<string, string | number | boolean> {
  const clean: Record<string, string | number | boolean> = {};
  if (!params) return clean;

  for (const [key, value] of Object.entries(params)) {
    // Remove PII
    if (PII_KEYS.includes(key.toLowerCase())) continue;
    // Remove undefined e null
    if (value === undefined || value === null) continue;
    clean[key] = value;
  }

  return clean;
}

/**
 * Envia um evento GA4 via gtag, se disponível
 */
export function trackEvent(eventName: string, params?: EventParams): void {
  try {
    const w = typeof window !== 'undefined'
      ? (window as Window & { gtag?: (...args: unknown[]) => void })
      : undefined;

    if (!w || typeof w.gtag !== 'function') {
      // gtag não disponível (adblock, script não carregado, etc.)
      return;
    }

    // Deduplicação de purchase
    if (eventName === 'purchase') {
      const txId = params?.transaction_id;
      if (typeof txId === 'string' && txId) {
        if (isTransactionTracked(txId)) {
          console.log(`[Analytics] Purchase ${txId} já rastreado, ignorando duplicata`);
          return;
        }
        markTransactionTracked(txId);
      }
    }

    const cleanedParams = cleanParams(params);
    w.gtag('event', eventName, cleanedParams);
  } catch (err) {
    // Nunca deve quebrar o app
    console.warn('[Analytics] Erro ao rastrear evento:', eventName, err);
  }
}

/**
 * Apenas para testes
 */
export function __resetPurchaseTrackingForTests(): void {
  try {
    localStorage.removeItem(PURCHASE_KEY);
  } catch {
    // ignore
  }
}
