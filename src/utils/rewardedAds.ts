declare global {
  interface Window {
    googletag?: GooglePublisherTag;
    easyPlatform?: EasyPlatformRewardedApi;
    EasyPlatformRewarded?: EasyPlatformRewardedApi;
  }
}

type RewardedAdProvider = "easyplatform" | "google_ad_manager" | "easyplatform_dev";

type RewardedAdResult = {
  provider: RewardedAdProvider;
  sessionId: string;
  rewarded: boolean;
  videoCompleted: boolean;
};

type EasyPlatformRewardedApi = {
  showRewardedAd?: (options: EasyPlatformRewardedOptions) => void | Promise<unknown>;
  showAd?: (options: EasyPlatformRewardedOptions) => void | Promise<unknown>;
};

type EasyPlatformRewardedOptions = {
  placementId?: string;
  zoneId?: string;
  onComplete?: () => void;
  onReward?: () => void;
  onClose?: () => void;
  onError?: (error: unknown) => void;
};

type GptSlot = {
  addService: (service: unknown) => GptSlot;
};

type RewardedSlotReadyEvent = {
  slot: GptSlot;
  makeRewardedVisible: () => void;
};

type RewardedSlotGrantedEvent = {
  slot: GptSlot;
  payload?: unknown;
};

type RewardedSlotClosedEvent = {
  slot: GptSlot;
};

type RewardedSlotVideoCompletedEvent = {
  slot: GptSlot;
};

type SlotRenderEndedEvent = {
  slot: GptSlot;
  isEmpty?: boolean;
};

type GptEvent =
  | RewardedSlotReadyEvent
  | RewardedSlotGrantedEvent
  | RewardedSlotClosedEvent
  | RewardedSlotVideoCompletedEvent
  | SlotRenderEndedEvent;

type GptPubAds = {
  addEventListener: (
    eventName:
      | "rewardedSlotReady"
      | "rewardedSlotGranted"
      | "rewardedSlotClosed"
      | "rewardedSlotVideoCompleted"
      | "slotRenderEnded",
    listener: (event: GptEvent) => void,
  ) => void;
};

type GooglePublisherTag = {
  cmd: Array<() => void>;
  defineOutOfPageSlot: (adUnitPath: string, format: unknown) => GptSlot | null;
  destroySlots: (slots: GptSlot[]) => boolean;
  display: (slot: GptSlot) => void;
  enableServices: () => void;
  enums: {
    OutOfPageFormat: {
      REWARDED: unknown;
    };
  };
  pubads: () => GptPubAds;
};

const GPT_SRC = "https://securepubads.g.doubleclick.net/tag/js/gpt.js";
const DEV_REWARDED_AD_UNIT = "/22639388115/rewarded_web_example";
const EASYPLATFORM_LOGIN_URL = "https://easyplatform.com/login.php";

const getRewardedProvider = (): RewardedAdProvider => {
  const provider = String(import.meta.env.VITE_REWARDED_AD_PROVIDER || "easyplatform").toLowerCase();
  return provider === "google_ad_manager" ? "google_ad_manager" : "easyplatform";
};

const getConfiguredRewardedAdUnit = () => {
  const configured =
    import.meta.env.VITE_GAM_REWARDED_AD_UNIT_PATH ||
    import.meta.env.VITE_GOOGLE_AD_MANAGER_REWARDED_AD_UNIT;

  if (configured) return configured;
  return import.meta.env.DEV ? DEV_REWARDED_AD_UNIT : "";
};

const getEasyPlatformConfig = () => ({
  scriptUrl: import.meta.env.VITE_EASYPLATFORM_REWARDED_SCRIPT_URL || "",
  embedUrl: import.meta.env.VITE_EASYPLATFORM_REWARDED_EMBED_URL || "",
  placementId:
    import.meta.env.VITE_EASYPLATFORM_REWARDED_PLACEMENT_ID ||
    import.meta.env.VITE_EASYPLATFORM_REWARDED_ZONE_ID ||
    "",
  minSeconds: Number(import.meta.env.VITE_EASYPLATFORM_REWARDED_MIN_SECONDS || (import.meta.env.DEV ? 5 : 20)),
});

const ensureScript = (src: string) =>
  new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing?.dataset.loaded === "true") {
      resolve();
      return;
    }

    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Falha ao carregar script de anuncios.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error("Falha ao carregar script de anuncios."));
    document.head.appendChild(script);
  });

const ensureGptScript = () => {
  window.googletag = window.googletag || ({ cmd: [] } as GooglePublisherTag);
  if (document.querySelector(`script[src="${GPT_SRC}"]`)) return;

  const script = document.createElement("script");
  script.src = GPT_SRC;
  script.async = true;
  document.head.appendChild(script);
};

const createAdSessionId = () => {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const clearRewardedHash = () => {
  if (window.location.hash === "#goog_rewarded" || window.location.hash === "#easy_rewarded") {
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }
};

const createRewardedShell = (title: string) => {
  const overlay = document.createElement("div");
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483647",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "background:rgba(2,6,23,.84)",
    "backdrop-filter:blur(8px)",
    "padding:16px",
  ].join(";");

  const panel = document.createElement("div");
  panel.style.cssText = [
    "width:min(720px,100%)",
    "min-height:360px",
    "border:1px solid rgba(255,255,255,.16)",
    "border-radius:12px",
    "background:#080b14",
    "color:white",
    "box-shadow:0 24px 80px rgba(0,0,0,.45)",
    "overflow:hidden",
    "font-family:Arial,sans-serif",
  ].join(";");

  const header = document.createElement("div");
  header.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.12);";
  header.innerHTML = `<strong>${title}</strong><span style="font-size:12px;color:#94a3b8">EasyPlatform</span>`;

  const body = document.createElement("div");
  body.style.cssText = "min-height:260px;display:flex;align-items:center;justify-content:center;background:#0f172a;";

  const footer = document.createElement("div");
  footer.style.cssText = "display:flex;gap:10px;align-items:center;justify-content:space-between;padding:14px 16px;border-top:1px solid rgba(255,255,255,.12);";

  const status = document.createElement("span");
  status.style.cssText = "font-size:13px;color:#cbd5e1";
  status.textContent = "Aguardando conclusao do video...";

  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Fechar";
  close.style.cssText = "border:1px solid rgba(255,255,255,.2);background:transparent;color:white;border-radius:8px;padding:8px 12px;cursor:pointer;";

  const complete = document.createElement("button");
  complete.type = "button";
  complete.disabled = true;
  complete.textContent = "Concluir anuncio";
  complete.style.cssText = "border:0;background:#facc15;color:#111827;border-radius:8px;padding:8px 12px;font-weight:700;cursor:pointer;opacity:.55;";

  footer.append(status, complete, close);
  panel.append(header, body, footer);
  overlay.append(panel);
  document.body.appendChild(overlay);

  return { overlay, body, status, close, complete };
};

const showEasyPlatformRewardedVideoAd = (timeoutMs = 60000): Promise<RewardedAdResult> => {
  const sessionId = createAdSessionId();
  const config = getEasyPlatformConfig();

  return new Promise((resolve, reject) => {
    let resolved = false;
    let provider: RewardedAdProvider = "easyplatform";
    const shell = createRewardedShell("Video recompensado");

    const finish = (result?: RewardedAdResult, error?: Error) => {
      if (resolved) return;
      resolved = true;
      window.clearTimeout(timeout);
      window.clearTimeout(enableManualCompletion);
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("easyplatformRewardedCompleted", handleCustomComplete);
      shell.overlay.remove();
      clearRewardedHash();

      if (error) reject(error);
      else if (result) resolve(result);
    };

    const completeAd = () => {
      finish({ provider, sessionId, rewarded: true, videoCompleted: true });
    };

    const handleCustomComplete = () => completeAd();
    const handleMessage = (event: MessageEvent) => {
      const data = typeof event.data === "string" ? event.data : event.data?.type;
      if (data === "easyplatform_rewarded_complete" || data === "rewarded_ad_complete") {
        completeAd();
      }
    };

    const timeout = window.setTimeout(() => {
      finish(undefined, new Error("O anuncio demorou demais para concluir. Tente novamente."));
    }, timeoutMs);

    const enableManualCompletion = window.setTimeout(() => {
      shell.complete.disabled = false;
      shell.complete.style.opacity = "1";
      shell.status.textContent = "Video concluido. Confirme para contar o anuncio.";
    }, Math.max(config.minSeconds, 3) * 1000);

    shell.close.onclick = () => finish(undefined, new Error("O anuncio foi fechado antes da conclusao."));
    shell.complete.onclick = () => {
      if (!shell.complete.disabled) completeAd();
    };

    window.addEventListener("message", handleMessage);
    window.addEventListener("easyplatformRewardedCompleted", handleCustomComplete);

    void (async () => {
      try {
        if (config.scriptUrl) {
          await ensureScript(config.scriptUrl);
        }

        const api = window.EasyPlatformRewarded || window.easyPlatform;
        const show = api?.showRewardedAd || api?.showAd;
        if (show) {
          await show.call(api, {
            placementId: config.placementId,
            zoneId: config.placementId,
            onComplete: completeAd,
            onReward: completeAd,
            onClose: () => finish(undefined, new Error("O anuncio foi fechado antes da recompensa.")),
            onError: (error) => finish(undefined, error instanceof Error ? error : new Error("EasyPlatform nao retornou anuncio.")),
          });
          return;
        }

        if (config.embedUrl) {
          const iframe = document.createElement("iframe");
          iframe.src = config.embedUrl;
          iframe.allow = "autoplay; fullscreen";
          iframe.style.cssText = "width:100%;height:280px;border:0;background:white;";
          shell.body.replaceChildren(iframe);
          return;
        }

        if (import.meta.env.DEV) {
          provider = "easyplatform_dev";
          shell.body.innerHTML = `<div style="text-align:center;padding:24px"><div style="font-size:42px;margin-bottom:12px">AD</div><p style="margin:0;color:#cbd5e1">Simulacao local EasyPlatform</p><p style="margin:8px 0 0;color:#94a3b8;font-size:13px">Configure VITE_EASYPLATFORM_REWARDED_SCRIPT_URL para usar anuncios reais.</p></div>`;
          return;
        }

        finish(
          undefined,
          new Error(`Configure o tag recompensado da EasyPlatform ou acesse ${EASYPLATFORM_LOGIN_URL}.`),
        );
      } catch (error) {
        finish(undefined, error instanceof Error ? error : new Error("Falha ao iniciar anuncio recompensado."));
      }
    })();
  });
};

export const hasRewardedAdUnit = () => {
  if (getRewardedProvider() === "google_ad_manager") return Boolean(getConfiguredRewardedAdUnit());
  const config = getEasyPlatformConfig();
  return Boolean(config.scriptUrl || config.embedUrl || import.meta.env.DEV);
};

export const showRewardedVideoAd = (timeoutMs = 60000): Promise<RewardedAdResult> => {
  if (getRewardedProvider() === "google_ad_manager") {
    return showGoogleRewardedVideoAd(timeoutMs);
  }

  return showEasyPlatformRewardedVideoAd(timeoutMs);
};

export const showGoogleRewardedVideoAd = (timeoutMs = 30000): Promise<RewardedAdResult> => {
  const adUnitPath = getConfiguredRewardedAdUnit();
  const sessionId = createAdSessionId();

  if (!adUnitPath) {
    return Promise.reject(
      new Error("Configure VITE_GAM_REWARDED_AD_UNIT_PATH para habilitar anuncios recompensados."),
    );
  }

  ensureGptScript();

  return new Promise((resolve, reject) => {
    let slot: GptSlot | null = null;
    let resolved = false;
    let rewarded = false;
    let videoCompleted = false;
    let ready = false;

    const finish = (result?: RewardedAdResult, error?: Error) => {
      if (resolved) return;
      resolved = true;
      window.clearTimeout(timer);
      clearRewardedHash();

      if (slot && window.googletag?.destroySlots) {
        window.googletag.destroySlots([slot]);
      }

      if (error) {
        reject(error);
      } else if (result) {
        resolve(result);
      }
    };

    const timer = window.setTimeout(() => {
      finish(
        undefined,
        new Error("Nenhum anuncio recompensado ficou disponivel agora. Tente novamente em alguns minutos."),
      );
    }, timeoutMs);

    window.googletag?.cmd.push(() => {
      try {
        const googletag = window.googletag;
        if (!googletag) {
          finish(undefined, new Error("Google Publisher Tag nao carregou."));
          return;
        }

        slot = googletag.defineOutOfPageSlot(
          adUnitPath,
          googletag.enums.OutOfPageFormat.REWARDED,
        );

        if (!slot) {
          finish(
            undefined,
            new Error("Este dispositivo ou pagina nao suporta anuncio recompensado no momento."),
          );
          return;
        }

        slot.addService(googletag.pubads());

        googletag.pubads().addEventListener("rewardedSlotReady", (event: RewardedSlotReadyEvent) => {
          if (event.slot !== slot || resolved) return;
          ready = true;
          event.makeRewardedVisible();
        });

        googletag.pubads().addEventListener("rewardedSlotGranted", (event: RewardedSlotGrantedEvent) => {
          if (event.slot !== slot || resolved) return;
          rewarded = true;
        });

        googletag.pubads().addEventListener(
          "rewardedSlotVideoCompleted",
          (event: RewardedSlotVideoCompletedEvent) => {
            if (event.slot !== slot || resolved) return;
            videoCompleted = true;
          },
        );

        googletag.pubads().addEventListener("rewardedSlotClosed", (event: RewardedSlotClosedEvent) => {
          if (event.slot !== slot || resolved) return;

          if (rewarded) {
            finish({ provider: "google_ad_manager", sessionId, rewarded, videoCompleted });
          } else {
            finish(undefined, new Error("O anuncio foi fechado antes de liberar a recompensa."));
          }
        });

        googletag.pubads().addEventListener("slotRenderEnded", (event: SlotRenderEndedEvent) => {
          if (event.slot !== slot || resolved) return;
          if (event.isEmpty && !ready) {
            finish(undefined, new Error("Nenhum video recompensado disponivel agora."));
          }
        });

        googletag.enableServices();
        googletag.display(slot);
      } catch (err) {
        finish(undefined, err instanceof Error ? err : new Error("Falha ao carregar anuncio recompensado."));
      }
    });
  });
};
