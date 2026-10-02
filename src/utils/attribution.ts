/**
 * Captura de atribuição first-touch (UTM e ?ref=) para cadastros
 *
 * Salva no localStorage na primeira visita com UTM/ref ou com referrer externo.
 * Expira após 30 dias.
 *
 * Uso:
 * - Chamar captureAttribution() no boot do app, ANTES de qualquer redirect de idioma
 * - Chamar recordSignupAttribution() quando a sessão autenticada for estabelecida
 *   (pode ser chamada várias vezes: só faz 1 chamada de RPC por usuário por carregamento de página)
 */

const STORAGE_KEY = 'dv_attribution';
const EXPIRY_DAYS = 30;
const MAX_FIELD_LENGTH = 100;
const MAX_REFERRER_LENGTH = 255;

/** Janela em que a RPC aceita gravar (24h no servidor; folga para relógio do cliente). */
const CLIENT_SIGNUP_WINDOW_MS = 25 * 60 * 60 * 1000;
/** Esperas entre tentativas quando o perfil ainda não existe (RPC retorna null). */
const RETRY_DELAYS_MS = [1500, 4000];

/**
 * Domínios que nunca contam como "referrer externo": o próprio site e os
 * provedores do fluxo de login (o retorno do Google OAuth chega com
 * document.referrer = accounts.google.com / *.supabase.co).
 */
const IGNORED_REFERRER_HOSTS = [
  'duelverse.site',
  'lovable.app',
  'lovableproject.com',
  'accounts.google.com',
  'accounts.youtube.com',
  'supabase.co',
  'supabase.in',
];

export interface AttributionData {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  ref?: string;
  /** Apenas o host do referrer externo (ex.: "reddit.com"), sem caminho/query. */
  referrer?: string;
  landing_path?: string;
  ts: number; // timestamp em ms
}

/**
 * Sanitiza uma string: trim, comprimento máximo, apenas caracteres ASCII imprimíveis
 */
function sanitize(input: string | null | undefined, maxLength: number): string | undefined {
  if (!input) return undefined;
  const printable = input.replace(/[^\x20-\x7E]/g, '').trim();
  if (!printable) return undefined;
  return printable.substring(0, maxLength).trim() || undefined;
}

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * Retorna o host do referrer se for de outro site (não o próprio site nem o fluxo de login).
 */
function externalReferrerHost(referrer: string): string | undefined {
  if (!referrer) return undefined;
  try {
    const refUrl = new URL(referrer);
    if (refUrl.protocol !== 'http:' && refUrl.protocol !== 'https:') return undefined;
    const host = normalizeHost(refUrl.hostname);
    if (!host) return undefined;
    if (host === normalizeHost(window.location.hostname)) return undefined;
    if (IGNORED_REFERRER_HOSTS.some((d) => hostMatches(host, d))) return undefined;
    return sanitize(host, MAX_REFERRER_LENGTH);
  } catch {
    return undefined;
  }
}

/**
 * Obtém os dados de atribuição salvos, se ainda válidos
 */
export function getAttribution(): AttributionData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw) as AttributionData;
    if (!data || typeof data !== 'object' || typeof data.ts !== 'number') {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    const age = Date.now() - data.ts;
    const maxAge = EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    if (age > maxAge) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * Captura a atribuição da URL atual, se ainda não houver atribuição válida salva.
 *
 * First-touch: se já existe atribuição válida (não expirada), não sobrescreve.
 *
 * Deve ser chamada no boot do app, ANTES de redirects de idioma.
 */
export function captureAttribution(): void {
  try {
    if (getAttribution()) {
      return; // First-touch: não sobrescreve
    }

    const params = new URLSearchParams(window.location.search);
    const utm_source = sanitize(params.get('utm_source'), MAX_FIELD_LENGTH);
    const utm_medium = sanitize(params.get('utm_medium'), MAX_FIELD_LENGTH);
    const utm_campaign = sanitize(params.get('utm_campaign'), MAX_FIELD_LENGTH);
    const utm_content = sanitize(params.get('utm_content'), MAX_FIELD_LENGTH);
    const ref = sanitize(params.get('ref'), MAX_FIELD_LENGTH);

    const hasUtmOrRef = utm_source || utm_medium || utm_campaign || utm_content || ref;
    const referrer = externalReferrerHost(document.referrer);

    // Só salva se houver UTM/ref OU referrer externo
    if (!hasUtmOrRef && !referrer) {
      return;
    }

    const landing_path = sanitize(window.location.pathname, MAX_FIELD_LENGTH);

    const data: AttributionData = { ts: Date.now() };
    if (utm_source) data.utm_source = utm_source;
    if (utm_medium) data.utm_medium = utm_medium;
    if (utm_campaign) data.utm_campaign = utm_campaign;
    if (utm_content) data.utm_content = utm_content;
    if (ref) data.ref = ref;
    if (referrer) data.referrer = referrer;
    if (landing_path) data.landing_path = landing_path;

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Em modo privado ou erro de storage, falha silenciosamente
  }
}

/**
 * Limpa a atribuição salva
 */
export function clearAttribution(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export interface AttributionUser {
  id: string;
  created_at?: string;
  app_metadata?: { provider?: string } | null;
}

interface RpcClient {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
}

/** Uma chamada por usuário por carregamento de página (INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED, getSession...). */
const inFlight = new Map<string, Promise<boolean>>();

/** Apenas para testes. */
export function __resetAttributionStateForTests(): void {
  inFlight.clear();
}

function isRecentSignup(user: AttributionUser): boolean {
  if (!user.created_at) return true; // na dúvida, o servidor decide
  const created = Date.parse(user.created_at);
  if (Number.isNaN(created)) return true;
  return Date.now() - created <= CLIENT_SIGNUP_WINDOW_MS;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function doRecord(supabaseClient: RpcClient, user: AttributionUser): Promise<boolean> {
  const attr = getAttribution();
  const args = {
    p_source: attr?.utm_source ?? null,
    p_medium: attr?.utm_medium ?? null,
    p_campaign: attr?.utm_campaign ?? null,
    p_content: attr?.utm_content ?? null,
    p_ref: attr?.ref ?? null,
    p_referrer: attr?.referrer ?? null,
    p_landing: attr?.landing_path ?? null,
  };

  for (let attempt = 0; ; attempt++) {
    const { data, error } = await supabaseClient.rpc('record_signup_attribution', args);

    if (error) {
      console.warn('[Attribution] Failed to record signup attribution:', error);
      return false;
    }

    if (data === true) {
      const w = typeof window !== 'undefined'
        ? (window as Window & { gtag?: (...args: unknown[]) => void })
        : undefined;
      if (w && typeof w.gtag === 'function') {
        try {
          w.gtag('event', 'sign_up', {
            method: user.app_metadata?.provider === 'google' ? 'google' : 'email',
            // Mesma precedência da RPC: utm_source > host do referrer > 'ref' > 'direct'
            source: attr?.utm_source || attr?.referrer || (attr?.ref ? 'ref' : 'direct'),
            medium: attr?.utm_medium || (!attr?.utm_source && attr?.referrer ? 'referral' : undefined),
            campaign: attr?.utm_campaign,
            content: attr?.utm_content,
            ref: attr?.ref,
          });
        } catch {
          // gtag nunca deve quebrar o app
        }
      }
      clearAttribution();
      return true;
    }

    // null => perfil ainda não existe (handle_new_user atrasado): tenta de novo
    if (data === null && attempt < RETRY_DELAYS_MS.length) {
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    }

    // false => já atribuído / fora da janela de 24h: não há mais o que fazer
    if (data === false) clearAttribution();
    return false;
  }
}

/**
 * Registra a atribuição do cadastro no banco, via RPC record_signup_attribution.
 *
 * Seguro de chamar em todo evento de auth: no máximo 1 RPC por usuário por
 * carregamento de página, e nenhuma para contas criadas há mais de ~24h.
 * Se a RPC retornar true (gravou), dispara o evento GA4 sign_up e limpa o localStorage.
 * Nunca rejeita.
 */
export function recordSignupAttribution(
  supabaseClient: RpcClient,
  user: AttributionUser | null | undefined
): Promise<boolean> {
  if (!user?.id || !isRecentSignup(user)) return Promise.resolve(false);

  const existing = inFlight.get(user.id);
  if (existing) return existing;

  const p = doRecord(supabaseClient, user).catch((err) => {
    console.warn('[Attribution] Error recording signup attribution:', err);
    return false;
  });
  inFlight.set(user.id, p);
  return p;
}
