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

export const isMonetagPushTag = (raw: string) => {
  const value = raw.toLowerCase();
  return value.includes("/act/files/tag.min.js") || value.includes("tag.min.js?z=");
};

export const isMonetagRewardedScript = (raw: string) => {
  if (!raw.trim() || isMonetagPushTag(raw)) return false;
  const template = document.createElement("template");
  template.innerHTML = raw.trim();
  return Array.from(template.content.querySelectorAll("script")).some((script) => {
    const sdk = script.getAttribute("data-sdk") || "";
    const zone = script.getAttribute("data-zone") || "";
    const src = script.getAttribute("src") || "";
    return /^show_[\w-]+$/.test(sdk) || (Boolean(zone) && /\/sdk\.js(?:[?#]|$)/i.test(src));
  });
};

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
    script.addEventListener("error", () => {
      loadedScripts.delete(key);
      script.remove();
    }, { once: true });
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
  script.addEventListener("error", () => {
    loadedScripts.delete(fnName);
    script.remove();
  }, { once: true });
  document.head.appendChild(script);
  loadedScripts.add(fnName);
};

/** Carrega o SDK sob demanda (nunca no boot da aplicação). */
export const ensureMonetagLoaded = async (): Promise<MonetagConfig | null> => {
  const config = await fetchMonetagConfig();
  if (!config.enabled) return null;

  if (isMonetagRewardedScript(config.customScript)) injectCustomScript(config.customScript);
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
    const zone = script.getAttribute("data-zone") || "";
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

export const isMonetagAvailable = async () => {
  const config = await fetchMonetagConfig();
  return config.enabled && (!!config.zoneId || isMonetagRewardedScript(config.customScript));
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
      throw new Error("Configure uma tag Rewarded/Interstitial válida da Monetag. Tags de Push não exibem anúncios recompensados.");
    }

    const fn = await waitForAnySdk(candidates);
    await fn();
    return true;
  } finally {
    setRewardedAdActive(false);
  }
};
