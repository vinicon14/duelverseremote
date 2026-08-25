/**
 * DuelVerse - Provedor Web Push nativo (VAPID + Service Worker)
 *
 * Usa a infraestrutura já existente do DuelVerse:
 * edge function `get-vapid-key` + tabela `push_subscriptions`.
 */
import { supabase } from "@/integrations/supabase/client";
import type { PushPermission, PushProvider, PushSubscriptionInfo } from "./types";

const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
};

let vapidKey: string | null = null;
let registration: ServiceWorkerRegistration | null = null;

const browserSupportsPush = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

export const webPushProvider: PushProvider = {
  id: "web-push",

  async isAvailable() {
    return browserSupportsPush();
  },

  async init() {
    if (!browserSupportsPush()) return;
    if (!registration) {
      try {
        registration =
          (await navigator.serviceWorker.getRegistration("/push-sw.js")) ||
          (await navigator.serviceWorker.register("/push-sw.js"));
      } catch (err) {
        console.warn("[push] falha ao registrar service worker", err);
      }
    }
    if (!vapidKey) {
      try {
        const { data } = await supabase.functions.invoke("get-vapid-key");
        vapidKey = data?.vapid_public_key ?? null;
      } catch (err) {
        console.warn("[push] falha ao obter a chave VAPID", err);
      }
    }
  },

  async requestPermission(): Promise<PushPermission> {
    if (!browserSupportsPush()) return "unsupported";
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    try {
      const result = await Notification.requestPermission();
      return result as PushPermission;
    } catch {
      return "denied";
    }
  },

  async subscribe(): Promise<PushSubscriptionInfo | null> {
    if (!browserSupportsPush() || Notification.permission !== "granted") return null;
    await this.init();
    if (!registration || !vapidKey) return null;

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) return null;

    try {
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        }));

      const json = subscription.toJSON() as { endpoint?: string; keys?: Record<string, string> };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;

      await supabase.from("push_subscriptions").upsert(
        {
          user_id: user.id,
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
          user_agent: navigator.userAgent,
        },
        { onConflict: "endpoint" }
      );

      return { provider: "web-push", endpoint: json.endpoint, raw: json };
    } catch (err) {
      console.warn("[push] falha ao registrar subscription", err);
      return null;
    }
  },

  async unsubscribe() {
    if (!browserSupportsPush()) return;
    try {
      const reg = registration || (await navigator.serviceWorker.getRegistration("/push-sw.js"));
      const subscription = await reg?.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
      }
    } catch (err) {
      console.warn("[push] falha ao remover subscription", err);
    }
  },
};
