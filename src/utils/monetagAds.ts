/**
 * DuelVerse - Integração Monetag (anúncios recompensados)
 *
 * A Monetag é o único provedor de anúncios do DuelVerse e só é exibida
 * quando o usuário clica em "Assistir anúncio" para receber recompensas.
 * A configuração fica no painel administrativo (tabela system_settings).
 */
import { supabase } from "@/integrations/supabase/client";

export interface MonetagConfig {
  enabled: boolean;
  zoneId: string;
  sdkDomain: string;
  customScript: string;
}

export const MONETAG_KEYS = {
  enabled: "monetag_enabled",
  zoneId: "monetag_zone_id",
  sdkDomain: "monetag_sdk_domain",
  customScript: "monetag_custom_script",
} as const;

const DEFAULT_SDK_DOMAIN = "vemtoutchave.com";

let cache: { value: MonetagConfig; at: number } | null = null;
const CACHE_MS = 60_000;

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
    sdkDomain: (map.get(MONETAG_KEYS.sdkDomain) || DEFAULT_SDK_DOMAIN).trim().replace(/^https?:\/\//, ""),
    customScript: map.get(MONETAG_KEYS.customScript) || "",
  };

  cache = { value: config, at: Date.now() };
  return config;
};

export const clearMonetagConfigCache = () => {
  cache = null;
};

const loadedScripts = new Set<string>();

const injectCustomScript = (raw: string) => {
  const key = `custom:${raw.length}`;
  if (loadedScripts.has(key)) return;
  const template = document.createElement("template");
  template.innerHTML = raw.trim();
  template.content.querySelectorAll("script").forEach((original) => {
    const script = document.createElement("script");
    Array.from(original.attributes).forEach((attr) => script.setAttribute(attr.name, attr.value));
    script.text = original.textContent || "";
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

const waitForSdk = (fnName: string, timeoutMs = 12000) =>
  new Promise<(...args: unknown[]) => Promise<unknown>>((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      const fn = (window as any)[fnName];
      if (typeof fn === "function") return resolve(fn);
      if (Date.now() - started > timeoutMs) return reject(new Error("O anúncio não carregou a tempo. Tente novamente."));
      window.setTimeout(tick, 250);
    };
    tick();
  });

export const isMonetagAvailable = async () => {
  const config = await fetchMonetagConfig();
  return config.enabled && (!!config.zoneId || !!config.customScript.trim());
};

/**
 * Exibe um anúncio recompensado da Monetag.
 * Resolve apenas quando o usuário assiste até o fim.
 */
export const showMonetagRewardedAd = async (): Promise<boolean> => {
  const config = await ensureMonetagLoaded();
  if (!config) throw new Error("Anúncios estão desativados no momento.");
  if (!config.zoneId) throw new Error("Configuração da Monetag incompleta.");

  const fn = await waitForSdk(`show_${config.zoneId}`);
  await fn();
  return true;
};
