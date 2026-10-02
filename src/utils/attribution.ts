/**
 * Captura de atribuição first-touch (UTM e ?ref=) para cadastros
 * 
 * Salva no localStorage na primeira visita com UTM/ref ou com referrer externo.
 * Expira após 30 dias.
 * 
 * Uso:
 * - Chamar captureAttribution() no boot do app, ANTES de qualquer redirect de idioma
 * - Chamar recordSignupAttribution() quando a sessão autenticada for estabelecida
 */

const STORAGE_KEY = 'dv_attribution';
const EXPIRY_DAYS = 30;
const MAX_FIELD_LENGTH = 100;
const MAX_REFERRER_LENGTH = 255;

export interface AttributionData {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  ref?: string;
  referrer?: string;
  landing_path?: string;
  ts: number; // timestamp em ms
}

/**
 * Sanitiza uma string: trim, comprimento máximo, apenas caracteres imprimíveis
 */
function sanitize(input: string | null | undefined, maxLength: number): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  
  // Remove caracteres não-imprimíveis (código ASCII < 32 ou > 126, exceto espaços que já são permitidos)
  const printable = trimmed.replace(/[^\x20-\x7E]/g, '');
  if (!printable) return undefined;
  
  return printable.substring(0, maxLength);
}

/**
 * Verifica se o referrer é de outro domínio (para não salvar navegação interna)
 */
function isExternalReferrer(referrer: string): boolean {
  if (!referrer) return false;
  try {
    const refUrl = new URL(referrer);
    return refUrl.hostname !== window.location.hostname;
  } catch {
    return false;
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
    
    // Verifica expiração
    const now = Date.now();
    const age = now - data.ts;
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
    // Verifica se já existe atribuição válida
    const existing = getAttribution();
    if (existing) {
      return; // First-touch: não sobrescreve
    }
    
    const params = new URLSearchParams(window.location.search);
    const utm_source = sanitize(params.get('utm_source'), MAX_FIELD_LENGTH);
    const utm_medium = sanitize(params.get('utm_medium'), MAX_FIELD_LENGTH);
    const utm_campaign = sanitize(params.get('utm_campaign'), MAX_FIELD_LENGTH);
    const utm_content = sanitize(params.get('utm_content'), MAX_FIELD_LENGTH);
    const ref = sanitize(params.get('ref'), MAX_FIELD_LENGTH);
    
    const hasUtmOrRef = utm_source || utm_medium || utm_campaign || utm_content || ref;
    
    const rawReferrer = document.referrer;
    const externalReferrer = isExternalReferrer(rawReferrer) ? sanitize(rawReferrer, MAX_REFERRER_LENGTH) : undefined;
    
    // Só salva se houver UTM/ref OU se houver referrer externo (para não perder cadastros diretos com origem)
    if (!hasUtmOrRef && !externalReferrer) {
      return;
    }
    
    const landing_path = sanitize(window.location.pathname, MAX_FIELD_LENGTH);
    
    const data: AttributionData = {
      ts: Date.now(),
    };
    
    if (utm_source) data.utm_source = utm_source;
    if (utm_medium) data.utm_medium = utm_medium;
    if (utm_campaign) data.utm_campaign = utm_campaign;
    if (utm_content) data.utm_content = utm_content;
    if (ref) data.ref = ref;
    if (externalReferrer) data.referrer = externalReferrer;
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

/**
 * Registra a atribuição do cadastro no banco, via RPC record_signup_attribution.
 * 
 * Deve ser chamada UMA VEZ quando a sessão autenticada for estabelecida,
 * no listener de onAuthStateChange ou equivalente.
 * 
 * Se a RPC retornar true (gravou), dispara o evento GA4 sign_up e limpa o localStorage.
 * 
 * @param supabaseClient Cliente Supabase autenticado
 * @param signupMethod 'email' ou 'google' (para o parâmetro `method` do GA4)
 * @returns true se a atribuição foi registrada, false caso contrário
 */
export async function recordSignupAttribution(
  supabaseClient: any,
  signupMethod: 'email' | 'google'
): Promise<boolean> {
  try {
    const attr = getAttribution();
    
    const { data, error } = await supabaseClient.rpc('record_signup_attribution', {
      p_source: attr?.utm_source || null,
      p_medium: attr?.utm_medium || null,
      p_campaign: attr?.utm_campaign || null,
      p_content: attr?.utm_content || null,
      p_ref: attr?.ref || null,
      p_referrer: attr?.referrer || null,
      p_landing: attr?.landing_path || null,
    });
    
    if (error) {
      console.warn('[Attribution] Failed to record signup attribution:', error);
      return false;
    }
    
    if (data === true) {
      // Dispara evento GA4 sign_up
      if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'sign_up', {
          method: signupMethod,
          source: attr?.utm_source || 'direct',
          medium: attr?.utm_medium,
          campaign: attr?.utm_campaign,
          content: attr?.utm_content,
        });
      }
      
      // Limpa o localStorage
      clearAttribution();
      return true;
    }
    
    return false;
  } catch (err) {
    console.warn('[Attribution] Error recording signup attribution:', err);
    return false;
  }
}
