/**
 * DuelVerse - Configuração de anúncios (Google AdSense + anúncios próprios)
 * Lê as chaves públicas de system_settings e os anúncios ativos da plataforma.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AdPlacement = "top" | "inline" | "popup";

export interface OwnAd {
  id: string;
  title: string;
  content: string;
  image_url?: string | null;
  link_url?: string | null;
  placement: AdPlacement;
}

export interface SiteAdsConfig {
  adsenseEnabled: boolean;
  adsenseClient: string;
  slotTop: string;
  slotInline: string;
  ownAds: OwnAd[];
}

export const ADSENSE_KEYS = {
  enabled: "adsense_enabled",
  client: "adsense_client",
  slotTop: "adsense_slot_top",
  slotInline: "adsense_slot_inline",
} as const;

export const DEFAULT_ADSENSE_CLIENT = "ca-pub-5741796577623184";

let cache: { at: number; value: SiteAdsConfig } | null = null;
let inflight: Promise<SiteAdsConfig> | null = null;
const CACHE_MS = 5 * 60 * 1000;

export const clearSiteAdsCache = () => {
  cache = null;
};

const load = async (): Promise<SiteAdsConfig> => {
  const [settingsRes, adsRes] = await Promise.all([
    supabase.from("system_settings").select("key, value").in("key", Object.values(ADSENSE_KEYS)),
    supabase.from("advertisements").select("*").eq("is_active", true),
  ]);
  const map = new Map((settingsRes.data || []).map((r) => [r.key, r.value ?? ""]));
  const now = Date.now();
  const ownAds = ((adsRes.data || []) as any[])
    .filter((a) => !a.expires_at || new Date(a.expires_at).getTime() > now)
    .map((a) => ({ ...a, placement: (a.placement || "top") as AdPlacement }));
  return {
    adsenseEnabled: map.get(ADSENSE_KEYS.enabled) === "true",
    adsenseClient: (map.get(ADSENSE_KEYS.client) || DEFAULT_ADSENSE_CLIENT).trim(),
    slotTop: (map.get(ADSENSE_KEYS.slotTop) || "").trim(),
    slotInline: (map.get(ADSENSE_KEYS.slotInline) || "").trim(),
    ownAds,
  };
};

export const fetchSiteAds = async (force = false) => {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  if (!inflight) {
    inflight = load().then((value) => {
      cache = { at: Date.now(), value };
      inflight = null;
      return value;
    }).catch((e) => { inflight = null; throw e; });
  }
  return inflight;
};

export const useSiteAds = () => {
  const [config, setConfig] = useState<SiteAdsConfig | null>(cache?.value ?? null);
  useEffect(() => {
    let alive = true;
    fetchSiteAds().then((c) => alive && setConfig(c)).catch(() => {});
    return () => { alive = false; };
  }, []);
  return config;
};
