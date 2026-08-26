/**
 * DuelVerse - Integração Monetag (anúncios recompensados)
 *
 * A Monetag é o único provedor de anúncios do DuelVerse e só é exibida
 * quando o usuário clica em "Assistir anúncio" para receber recompensas.
 * A configuração fica no painel administrativo (tabela system_settings).
 */
import { supabase } from "@/integrations/supabase/client";

declare global {
  interface Window {
    __duelverseMonetagComplete?: () => void;
    __duelverseRewardedAdActive?: boolean;
    __duelverseRewardedAdTimer?: number;
  }
}

export interface MonetagConfig {
  enabled: boolean;
  zoneId: string;
  sdkDomain: string;
  customScript: string;
  minSeconds: number;
}

export const MONETAG_KEYS = {
  enabled: "monetag_enabled",
  zoneId: "monetag_zone_id",
  sdkDomain: "monetag_sdk_domain",
  customScript: "monetag_custom_script",
  minSeconds: "monetag_min_seconds",
} as const;

const DEFAULT_SDK_DOMAIN = "libtl.com";
export const DUELVERSE_MONETAG_ATTR = "data-duelverse-authorized-ad";

let cache: { value: MonetagConfig; at: number } | null = null;
const CACHE_MS = 60_000;

const cleanSdkDomain = (domain: string) =>
  {
    const cleaned = domain
    .trim()
    .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");
    if (!cleaned || cleaned === "ventoutchave.com" || cleaned === "vemtoutchave.com") return DEFAULT_SDK_DOMAIN;
    return cleaned;
  };

export const fetchMonetagConfig = async (force = false): Promise<MonetagConfig> => {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  const { data } = await supabase
    .from("system_settings")
    .select("key, value")
    .in("key", Object.values(MONETAG_KEYS));

  const map = new Map((data || []).map((row) => [row.key, row.value ?? ""]));
  const config: MonetagConfig = {
    enabled: (map.get(MONETAG_KEYS.enabled) || "false") === "true",
    zoneId: (map.get(MONETAG_KEYS.zoneId) || "").trim(),
    sdkDomain: cleanSdkDomain(map.get(MONETAG_KEYS.sdkDomain) || DEFAULT_SDK_DOMAIN),
    customScript: map.get(MONETAG_KEYS.customScript) || "",
    minSeconds: Math.max(3, Number(map.get(MONETAG_KEYS.minSeconds) || 15)),
  };

  cache = { value: config, at: Date.now() };
  return config;
};

export const clearMonetagConfigCache = () => {
  cache = null;
};

const loadedScripts = new Set<string>();

export const markAuthorizedMonetagElement = (el: HTMLElement) => {
  el.setAttribute(DUELVERSE_MONETAG_ATTR, "monetag");
  el.dataset.duelverseMonetag = "true";
};

export const isAuthorizedMonetagElement = (el: Element) =>
  el.getAttribute(DUELVERSE_MONETAG_ATTR) === "monetag" ||
  Boolean(el.closest?.(`[${DUELVERSE_MONETAG_ATTR}="monetag"]`));

const injectCustomScript = (raw: string) => {
  const key = `custom:${raw}`;
  if (loadedScripts.has(key)) return;
  const template = document.createElement("template");
  template.innerHTML = raw.trim();
  template.content.querySelectorAll("script").forEach((original) => {
    const script = document.createElement("script");
    Array.from(original.attributes).forEach((attr) => script.setAttribute(attr.name, attr.value));
    script.text = original.textContent || "";
    markAuthorizedMonetagElement(script);
    document.head.appendChild(script);
  });
  loadedScripts.add(key);
};

const injectZoneScript = (config: MonetagConfig) => {
  const fnName = `show_${config.zoneId}`;
  if (loadedScripts.has(fnName) || (window as any)[fnName]) return;
  const script = document.createElement("script");
  script.src = `https://${config.sdkDomain}/sdk.js`;
  script.async = true;
  script.dataset.zone = config.zoneId;
  script.dataset.sdk = fnName;
  markAuthorizedMonetagElement(script);
  document.head.appendChild(script);
  loadedScripts.add(fnName);
};

/** Carrega o SDK sob demanda (nunca no boot da aplicação). */
export const ensureMonetagLoaded = async (): Promise<MonetagConfig | null> => {
  const config = await fetchMonetagConfig();
  if (!config.enabled) return null;

  if (config.customScript.trim()) injectCustomScript(config.customScript);
  if (config.zoneId) injectZoneScript(config);

  return config;
};

const extractSdkCandidates = (config: MonetagConfig) => {
  const names = new Set<string>();
  if (config.zoneId) names.add(`show_${config.zoneId}`);

  const template = document.createElement("template");
  template.innerHTML = config.customScript.trim();
  template.content.querySelectorAll("script").forEach((script) => {
    const sdk = script.getAttribute("data-sdk") || "";
    const zone = script.getAttribute("data-zone") || new URL(script.getAttribute("src") || window.location.href, window.location.href).searchParams.get("z") || "";
    if (sdk) names.add(sdk);
    if (zone) names.add(`show_${zone}`);
  });

  return Array.from(names);
};

const waitForAnySdk = (names: string[], timeoutMs = 12000) =>
  new Promise<(...args: unknown[]) => Promise<unknown>>((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      for (const name of names) {
        const fn = (window as any)[name];
        if (typeof fn === "function") return resolve(fn);
      }
      if (Date.now() - started > timeoutMs) return reject(new Error("O anúncio não carregou a tempo. Tente novamente."));
      window.setTimeout(tick, 250);
    };
    tick();
  });

const setRewardedAdActive = (active: boolean, ttlMs = 60000) => {
  if (window.__duelverseRewardedAdTimer) {
    window.clearTimeout(window.__duelverseRewardedAdTimer);
    window.__duelverseRewardedAdTimer = undefined;
  }

  window.__duelverseRewardedAdActive = active;
  if (active) {
    window.__duelverseRewardedAdTimer = window.setTimeout(() => {
      window.__duelverseRewardedAdActive = false;
      window.__duelverseRewardedAdTimer = undefined;
    }, ttlMs);
  }
};

const showManualCompletionShell = (minSeconds: number, timeoutMs: number) =>
  new Promise<boolean>((resolve, reject) => {
    let resolved = false;
    let secondsLeft = Math.max(minSeconds, 3);

    const overlay = document.createElement("div");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(2,6,23,.84);backdrop-filter:blur(8px);padding:16px;";
    markAuthorizedMonetagElement(overlay);

    const panel = document.createElement("div");
    panel.style.cssText = "width:min(720px,100%);min-height:340px;border:1px solid rgba(255,255,255,.16);border-radius:12px;background:#080b14;color:white;box-shadow:0 24px 80px rgba(0,0,0,.45);overflow:hidden;font-family:Arial,sans-serif;";

    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.12);";
    header.innerHTML = `<strong>Anúncio recompensado</strong><span style="font-size:12px;color:#94a3b8">Monetag</span>`;

    const body = document.createElement("div");
    body.style.cssText = "min-height:240px;display:flex;align-items:center;justify-content:center;background:#0f172a;text-align:center;padding:24px;color:#cbd5e1;";
    body.textContent = "Aguardando anúncio...";

    const footer = document.createElement("div");
    footer.style.cssText = "display:flex;gap:10px;align-items:center;justify-content:space-between;padding:14px 16px;border-top:1px solid rgba(255,255,255,.12);";

    const status = document.createElement("span");
    status.style.cssText = "font-size:13px;color:#cbd5e1";
    status.textContent = `Aguarde ${secondsLeft}s para liberar a recompensa...`;

    const complete = document.createElement("button");
    complete.type = "button";
    complete.disabled = true;
    complete.textContent = "Concluir anúncio";
    complete.style.cssText = "border:0;background:#facc15;color:#111827;border-radius:8px;padding:8px 12px;font-weight:700;cursor:pointer;opacity:.55;";

    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Fechar";
    close.style.cssText = "border:1px solid rgba(255,255,255,.2);background:transparent;color:white;border-radius:8px;padding:8px 12px;cursor:pointer;";

    footer.append(status, complete, close);
    panel.append(header, body, footer);
    overlay.append(panel);
    document.body.appendChild(overlay);

    const finish = (ok: boolean, error?: Error) => {
      if (resolved) return;
      resolved = true;
      window.clearInterval(tick);
      window.clearTimeout(timeout);
      delete window.__duelverseMonetagComplete;
      overlay.remove();
      if (ok) resolve(true);
      else reject(error || new Error("O anúncio foi fechado antes da conclusão."));
    };

    window.__duelverseMonetagComplete = () => finish(true);
    const tick = window.setInterval(() => {
      secondsLeft -= 1;
      if (secondsLeft > 0) {
        status.textContent = `Aguarde ${secondsLeft}s para liberar a recompensa...`;
      } else {
        window.clearInterval(tick);
        complete.disabled = false;
        complete.style.opacity = "1";
        status.textContent = "Pronto! Confirme para receber a recompensa.";
      }
    }, 1000);
    const timeout = window.setTimeout(() => finish(false, new Error("O anúncio demorou demais para concluir. Tente novamente.")), timeoutMs);

    close.onclick = () => finish(false);
    complete.onclick = () => {
      if (!complete.disabled) finish(true);
    };
  });

export const isMonetagAvailable = async () => {
  const config = await fetchMonetagConfig();
  return config.enabled && (!!config.zoneId || !!config.customScript.trim());
};

/**
 * Exibe um anúncio recompensado da Monetag.
 * Resolve apenas quando o usuário assiste até o fim.
 */
export const showMonetagRewardedAd = async (timeoutMs?: number): Promise<boolean> => {
  const effectiveTimeoutMs = timeoutMs ?? 60000;
  setRewardedAdActive(true, effectiveTimeoutMs);
  try {
    const config = await ensureMonetagLoaded();
    if (!config) throw new Error("Anúncios estão desativados no momento.");

    const candidates = extractSdkCandidates(config);
    if (candidates.length === 0) {
      await showManualCompletionShell(config.minSeconds, effectiveTimeoutMs);
      return true;
    }

    const fn = await waitForAnySdk(candidates).catch(async (error) => {
      if (config.customScript.trim()) {
        await showManualCompletionShell(config.minSeconds, effectiveTimeoutMs);
        return null;
      }
      throw error;
    });

    if (!fn) return true;
    await fn();
    return true;
  } finally {
    setRewardedAdActive(false);
  }
};
