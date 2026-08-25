/**
 * DuelVerse - Provedor de Push Notifications da Monetag
 *
 * ESTRUTURA MODULAR: este arquivo é o único ponto de integração com a Monetag.
 * Nenhuma API/identificador fictício é usado aqui — apenas o carregamento da
 * tag oficial fornecida pela Monetag, configurável pelo painel administrativo
 * (tabela `system_settings`).
 *
 * Chaves de configuração:
 *  - monetag_push_enabled  -> "true" | "false"
 *  - monetag_push_tag_url  -> URL completa da tag oficial (ex.: https://.../tag.min.js?z=XXXX)
 *  - monetag_push_script   -> bloco <script> oficial completo (alternativa à URL)
 *
 * Quando a Monetag entregar código adicional (SDK com métodos próprios),
 * basta implementar as chamadas nos pontos marcados com TODO abaixo.
 */
import { supabase } from "@/integrations/supabase/client";
import type { PushPermission, PushProvider, PushSubscriptionInfo } from "./types";

export const MONETAG_PUSH_KEYS = {
  enabled: "monetag_push_enabled",
  tagUrl: "monetag_push_tag_url",
  script: "monetag_push_script",
} as const;

export interface MonetagPushConfig {
  enabled: boolean;
  tagUrl: string;
  script: string;
}

let configCache: { value: MonetagPushConfig; at: number } | null = null;
const CACHE_MS = 60_000;
let injected = false;

export const fetchMonetagPushConfig = async (force = false): Promise<MonetagPushConfig> => {
  if (!force && configCache && Date.now() - configCache.at < CACHE_MS) return configCache.value;

  const { data } = await supabase
    .from("system_settings")
    .select("key, value")
    .in("key", Object.values(MONETAG_PUSH_KEYS));

  const map = new Map((data || []).map((row) => [row.key, row.value ?? ""]));
  const value: MonetagPushConfig = {
    enabled: (map.get(MONETAG_PUSH_KEYS.enabled) || "false") === "true",
    tagUrl: (map.get(MONETAG_PUSH_KEYS.tagUrl) || "").trim(),
    script: map.get(MONETAG_PUSH_KEYS.script) || "",
  };

  configCache = { value, at: Date.now() };
  return value;
};

export const clearMonetagPushConfigCache = () => {
  configCache = null;
};

const injectTag = (config: MonetagPushConfig) => {
  if (injected) return;

  if (config.script.trim()) {
    const template = document.createElement("template");
    template.innerHTML = config.script.trim();
    template.content.querySelectorAll("script").forEach((original) => {
      const script = document.createElement("script");
      for (const attr of Array.from(original.attributes)) {
        script.setAttribute(attr.name, attr.value);
      }
      script.text = original.text;
      document.head.appendChild(script);
    });
    injected = true;
    return;
  }

  if (config.tagUrl) {
    const script = document.createElement("script");
    script.src = config.tagUrl;
    script.async = true;
    script.setAttribute("data-cfasync", "false");
    document.head.appendChild(script);
    injected = true;
  }
};

export const monetagPushProvider: PushProvider = {
  id: "monetag",

  async isAvailable() {
    if (typeof window === "undefined" || !("Notification" in window)) return false;
    const config = await fetchMonetagPushConfig();
    return config.enabled && Boolean(config.tagUrl || config.script.trim());
  },

  async init() {
    const config = await fetchMonetagPushConfig();
    if (!config.enabled) return;
    injectTag(config);
    // TODO(Monetag): chamar aqui a inicialização oficial do SDK, quando fornecida.
  },

  async requestPermission(): Promise<PushPermission> {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    // A tag oficial da Monetag exibe o próprio prompt de permissão do navegador.
    return Notification.permission as PushPermission;
  },

  async subscribe(): Promise<PushSubscriptionInfo | null> {
    // TODO(Monetag): quando o SDK oficial expor um identificador de subscriber,
    // registrá-lo aqui (ex.: salvar em `push_subscriptions` com provider = 'monetag').
    return null;
  },

  async unsubscribe() {
    // TODO(Monetag): chamar o método oficial de opt-out quando disponível.
    injected = false;
  },
};
