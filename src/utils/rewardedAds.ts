declare global {
  interface Window {
    googletag?: GooglePublisherTag;
  }
}

type RewardedAdResult = {
  provider: "google_ad_manager";
  sessionId: string;
  rewarded: boolean;
  videoCompleted: boolean;
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

const getConfiguredRewardedAdUnit = () => {
  const configured =
    import.meta.env.VITE_GAM_REWARDED_AD_UNIT_PATH ||
    import.meta.env.VITE_GOOGLE_AD_MANAGER_REWARDED_AD_UNIT;

  if (configured) return configured;
  return import.meta.env.DEV ? DEV_REWARDED_AD_UNIT : "";
};

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

export const hasRewardedAdUnit = () => Boolean(getConfiguredRewardedAdUnit());

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
