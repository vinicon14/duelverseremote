/**
 * DuelVerse - Orquestrador de Push Notifications
 *
 * Camada única e isolada do restante do app: qualquer parte do DuelVerse
 * pode ativar/desativar push sem conhecer o provedor por trás.
 * Se o push falhar ou for negado, o app continua funcionando normalmente.
 */
import type { PushEnvironment, PushPermission, PushProvider } from "./types";
import { webPushProvider } from "./webPushProvider";
import { monetagPushProvider } from "./monetagPushProvider";

const OPT_IN_KEY = "duelverse_push_opt_in";

const providers: PushProvider[] = [webPushProvider, monetagPushProvider];

export const getPushEnvironment = (): PushEnvironment => {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return { supported: false, reason: "Este navegador não suporta notificações.", permission: "unsupported" };
  }
  const supported = "serviceWorker" in navigator && "PushManager" in window;
  return {
    supported,
    reason: supported ? undefined : "Notificações push não estão disponíveis neste dispositivo.",
    permission: Notification.permission as PushPermission,
  };
};

export const isPushOptedIn = () => {
  try {
    return localStorage.getItem(OPT_IN_KEY) !== "false";
  } catch {
    return true;
  }
};

const setOptIn = (value: boolean) => {
  try {
    localStorage.setItem(OPT_IN_KEY, String(value));
  } catch {
    /* ignore */
  }
};

/** Inicializa os provedores disponíveis. Nunca lança. */
export const initPushNotifications = async () => {
  if (!isPushOptedIn()) return;
  for (const provider of providers) {
    try {
      if (await provider.isAvailable()) await provider.init();
    } catch (err) {
      console.warn(`[push] provedor ${provider.id} falhou ao inicializar`, err);
    }
  }
};

/** Solicita permissão e registra as subscriptions. Retorna a permissão final. */
export const enablePushNotifications = async (): Promise<PushPermission> => {
  const env = getPushEnvironment();
  if (env.permission === "unsupported") return "unsupported";

  setOptIn(true);
  let permission: PushPermission = env.permission;

  for (const provider of providers) {
    try {
      if (!(await provider.isAvailable())) continue;
      await provider.init();
      const result = await provider.requestPermission();
      if (result === "granted") permission = "granted";
      else if (permission !== "granted") permission = result;
      if (result === "granted") await provider.subscribe();
    } catch (err) {
      console.warn(`[push] provedor ${provider.id} falhou ao ativar`, err);
    }
  }

  return permission;
};

/** Desativa push notifications e remove as subscriptions registradas. */
export const disablePushNotifications = async () => {
  setOptIn(false);
  for (const provider of providers) {
    try {
      await provider.unsubscribe();
    } catch (err) {
      console.warn(`[push] provedor ${provider.id} falhou ao desativar`, err);
    }
  }
};
