/**
 * Helper unificado para eventos GA4 no DuelVerse
 *
 * Convenções:
 * - Sempre try/catch (nunca quebrar o app)
 * - Remove params undefined/null/NaN
 * - Nunca envia PII (email, username, CPF, telefone, etc.), nem por chave nem por valor
 * - currency: 'BRL' quando houver value
 *
 * Uso:
 *   trackEvent('purchase', { transaction_id: orderId, value: 49.90, currency: 'BRL' })
 */

/** Chaves descartadas quando contêm um destes trechos (case-insensitive). */
const PII_KEY_FRAGMENTS = ['email', 'e_mail', 'username', 'user_name', 'cpf', 'phone', 'telefone', 'password', 'senha'];
/** Chaves descartadas só quando são exatamente estas. */
const PII_EXACT_KEYS = ['name', 'nome', 'full_name'];
/** Valores descartados mesmo com chave inocente (ex.: ?src=fulano@x.com). */
const EMAIL_VALUE_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const CPF_VALUE_RE = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/;

export interface EventParams {
  [key: string]: string | number | boolean | null | undefined;
}

type Gtag = (...args: unknown[]) => void;

function getGtag(): Gtag | null {
  if (typeof window === 'undefined') return null;
  const g = (window as Window & { gtag?: Gtag }).gtag;
  return typeof g === 'function' ? g : null;
}

function isPiiKey(key: string): boolean {
  const k = key.toLowerCase();
  return PII_EXACT_KEYS.includes(k) || PII_KEY_FRAGMENTS.some((f) => k.includes(f));
}

function isPiiValue(value: unknown): boolean {
  return typeof value === 'string' && (EMAIL_VALUE_RE.test(value) || CPF_VALUE_RE.test(value.trim()));
}

/**
 * Remove undefined, null, números não finitos e PII dos parâmetros
 */
function cleanParams(params: EventParams | undefined): Record<string, string | number | boolean> {
  const clean: Record<string, string | number | boolean> = {};
  if (!params) return clean;

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'number' && !Number.isFinite(value)) continue;
    if (isPiiKey(key) || isPiiValue(value)) continue;
    clean[key] = value;
  }

  return clean;
}

/* ------------------------------------------------------------------ */
/* Deduplicação de purchase via localStorage (compartilhado entre abas) */
/* ------------------------------------------------------------------ */

const PURCHASE_KEY = 'dv_tracked_purchases';
const MAX_TRACKED_PURCHASES = 100;

function readJsonArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // modo privado / storage cheio: falha silenciosa
  }
}

export function isPurchaseTracked(transactionId: string): boolean {
  return readJsonArray<string>(PURCHASE_KEY).includes(transactionId);
}

function markPurchaseTracked(transactionId: string): void {
  const arr = readJsonArray<string>(PURCHASE_KEY).filter((id) => id !== transactionId);
  arr.push(transactionId);
  // Mantém só as últimas N transações
  if (arr.length > MAX_TRACKED_PURCHASES) arr.splice(0, arr.length - MAX_TRACKED_PURCHASES);
  writeJson(PURCHASE_KEY, arr);
}

/**
 * Envia um evento GA4 via gtag, se disponível.
 * Retorna true se o evento foi entregue ao gtag.
 * `purchase` com transaction_id é enviado no máximo 1x por transaction_id neste navegador
 * (reload, outra aba ou retorno do checkout não duplicam).
 */
export function trackEvent(eventName: string, params?: EventParams): boolean {
  try {
    const gtag = getGtag();
    // gtag não disponível (script bloqueado, teste, etc.): não faz nada
    if (!gtag) return false;

    const rawTx = params?.transaction_id;
    const txId = eventName === 'purchase' && (typeof rawTx === 'string' || typeof rawTx === 'number') && rawTx !== ''
      ? String(rawTx)
      : null;
    if (txId && isPurchaseTracked(txId)) return false;

    gtag('event', eventName, cleanParams(params));

    // Só marca depois que o gtag aceitou o evento (se ele lançar, uma próxima tentativa ainda envia)
    if (txId) markPurchaseTracked(txId);
    return true;
  } catch (err) {
    // Nunca deve quebrar o app
    console.warn('[Analytics] Erro ao rastrear evento:', eventName, err);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Funil de receita                                                     */
/* ------------------------------------------------------------------ */

/**
 * Normaliza o `?src=` (vem da URL, portanto controlável por qualquer link):
 * só aceita um identificador curto [a-z0-9_-], senão descarta.
 */
export function sanitizeSrc(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toLowerCase();
  return /^[a-z0-9_-]{1,40}$/.test(v) ? v : undefined;
}

export type CheckoutMethod = 'pix' | 'card' | 'stripe';

/**
 * duelcoins_orders.payment_method pode ser 'pix', 'card', 'stripe' ou, depois do webhook do
 * Mercado Pago, o payment_method_id dele ('visa', 'master', 'account_money', ...).
 */
export function normalizePaymentMethod(pm: string | null | undefined, fallback: CheckoutMethod = 'card'): CheckoutMethod {
  const v = (pm || '').toLowerCase();
  if (v === 'pix') return 'pix';
  if (v === 'stripe') return 'stripe';
  if (!v) return fallback;
  return 'card';
}

/** Extrai o id da Checkout Session (cs_test_/cs_live_) da URL retornada pelo stripe-create-checkout. */
export function extractStripeSessionId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /\/(cs_(?:test|live)_[A-Za-z0-9]+)/.exec(url);
  return m ? m[1] : null;
}

/**
 * Checkouts iniciados NESTE navegador, guardados pelo external_order_id do pedido
 * (PIX: payment_id do MP; cartão: preference_id do MP; Stripe: id da Checkout Session).
 * Só pedidos desta lista viram `purchase` no cliente: assim um pedido antigo, de outro
 * aparelho, nunca é atribuído a esta sessão.
 */
const PENDING_KEY = 'dv_pending_checkouts';
const PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PENDING = 20;

interface PendingCheckout {
  ref: string;
  method: CheckoutMethod;
  at: number;
}

function readPending(now: number): PendingCheckout[] {
  return readJsonArray<PendingCheckout>(PENDING_KEY).filter(
    (p) => p && typeof p.ref === 'string' && p.ref && typeof p.at === 'number' && now - p.at < PENDING_TTL_MS
  );
}

export function rememberPendingCheckout(ref: string | number | null | undefined, method: CheckoutMethod, now = Date.now()): void {
  try {
    if (ref === null || ref === undefined || ref === '') return;
    const key = String(ref);
    const list = readPending(now).filter((p) => p.ref !== key);
    list.push({ ref: key, method, at: now });
    if (list.length > MAX_PENDING) list.splice(0, list.length - MAX_PENDING);
    writeJson(PENDING_KEY, list);
  } catch {
    // chamado no caminho do pagamento: nunca pode lançar
  }
}

export function getPendingCheckoutRefs(now = Date.now()): string[] {
  return readPending(now).map((p) => p.ref);
}

export function forgetPendingCheckout(ref: string | null | undefined): void {
  try {
    if (!ref) return;
    writeJson(PENDING_KEY, readPending(Date.now()).filter((p) => p.ref !== ref));
  } catch {
    // ignore
  }
}

export interface OrderForTracking {
  id: string;
  status: string;
  amount_brl: number | string;
  duelcoins_amount: number;
  coupon_code?: string | null;
  payment_method?: string | null;
  external_order_id?: string | null;
}

/** Colunas de duelcoins_orders necessárias para o purchase (nada de PII). */
export const ORDER_TRACKING_COLUMNS = 'id, status, amount_brl, duelcoins_amount, coupon_code, payment_method, external_order_id';

/**
 * Dispara `purchase` a partir do pedido lido do banco, e só se ele estiver `paid`.
 * value/package_dc/coupon vêm do pedido (gravado pelo servidor), não da UI.
 */
export function trackPurchaseForOrder(order: OrderForTracking | null | undefined, fallbackMethod: CheckoutMethod = 'card'): boolean {
  try {
    if (!order || order.status !== 'paid' || !order.id) return false;
    const sent = trackEvent('purchase', {
      transaction_id: order.id,
      value: Number(order.amount_brl),
      currency: 'BRL',
      method: normalizePaymentMethod(order.payment_method, fallbackMethod),
      package_dc: Number(order.duelcoins_amount),
      coupon: order.coupon_code || undefined,
    });
    if (sent || isPurchaseTracked(order.id)) forgetPendingCheckout(order.external_order_id);
    return sent;
  } catch {
    return false;
  }
}

/** Status finais que nunca vão virar paid: param de esperar por eles. */
const TERMINAL_UNPAID = ['cancelled', 'canceled', 'rejected', 'refunded', 'charged_back', 'amount_mismatch'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OrdersClient = { from: (table: string) => any };

export interface ReconcileOptions {
  /** Quantas leituras no máximo (1 = só confere uma vez). */
  attempts?: number;
  intervalMs?: number;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Confere no banco os checkouts pendentes deste navegador e dispara `purchase` para os que
 * já estão `paid`. Usado no retorno do Mercado Pago/Stripe (?success=true), com algumas
 * tentativas porque o webhook pode chegar depois do redirecionamento, e em toda visita a
 * /buy-duelcoins (cobre o PIX pago depois de fechar o QR code). Sem pendências, não faz
 * nenhuma consulta. Nunca rejeita.
 */
export async function reconcilePendingPurchases(
  client: OrdersClient,
  userId: string,
  { attempts = 1, intervalMs = 5000, signal, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }: ReconcileOptions = {}
): Promise<number> {
  let tracked = 0;
  try {
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (signal?.aborted || !userId) break;
      const refs = getPendingCheckoutRefs();
      if (refs.length === 0) break;

      const { data, error } = await client
        .from('duelcoins_orders')
        .select(ORDER_TRACKING_COLUMNS)
        .eq('user_id', userId)
        .in('external_order_id', refs);
      if (signal?.aborted) break;

      if (!error && Array.isArray(data)) {
        for (const order of data as OrderForTracking[]) {
          if (order.status === 'paid') {
            if (trackPurchaseForOrder(order)) tracked++;
          } else if (TERMINAL_UNPAID.includes(order.status)) {
            forgetPendingCheckout(order.external_order_id);
          }
        }
      }

      if (attempt < attempts - 1 && getPendingCheckoutRefs().length > 0) await sleep(intervalMs);
    }
  } catch (err) {
    console.warn('[Analytics] Erro ao conferir pedidos pendentes:', err);
  }
  return tracked;
}

/**
 * Apenas para testes
 */
export function __resetPurchaseTrackingForTests(): void {
  try {
    localStorage.removeItem(PURCHASE_KEY);
    localStorage.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
}
