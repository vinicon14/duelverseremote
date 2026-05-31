/**
 * Modo Duelista Imersivo — Provider Central
 *
 * Ativa automaticamente quando ambos os jogadores estão com Arena Digital aberta.
 * Gerencia configurações persistidas em localStorage (áudio, animações, narração,
 * automações, acessibilidade) e expõe estado para os subcomponentes imersivos.
 *
 * Fases futuras (música, narração, eventos) consomem este contexto via useImmersiveMode.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ImmersiveSettings = {
  // Áudio
  musicVolume: number;        // 0-100
  sfxVolume: number;          // 0-100
  narrationVolume: number;    // 0-100
  voiceChatVolume: number;    // 0-100
  // Interface
  cardScale: number;          // 0.8 - 1.4
  lpScale: number;            // 0.8 - 1.6
  uiOpacity: number;          // 0-100
  // Animações
  animationsEnabled: boolean;
  animationSpeed: number;     // 0.5 - 2
  summonEffectsEnabled: boolean;
  // Automações / Narração
  narrationEnabled: boolean;
  narrationLanguage: "pt-BR" | "en-US";
  narrationFrequency: "all" | "important" | "off";
  cardEffectAutoRead: boolean;
  highlightValidTargets: boolean;
  // Acessibilidade
  colorblindMode: "off" | "protanopia" | "deuteranopia" | "tritanopia";
  largeFonts: boolean;
  highContrast: boolean;
  captions: boolean;
};

const DEFAULTS: ImmersiveSettings = {
  musicVolume: 30,
  sfxVolume: 70,
  narrationVolume: 80,
  voiceChatVolume: 100,
  cardScale: 1,
  lpScale: 1,
  uiOpacity: 100,
  animationsEnabled: true,
  animationSpeed: 1,
  summonEffectsEnabled: true,
  narrationEnabled: false,
  narrationLanguage: "pt-BR",
  narrationFrequency: "important",
  cardEffectAutoRead: false,
  highlightValidTargets: true,
  colorblindMode: "off",
  largeFonts: false,
  highContrast: false,
  captions: false,
};

const STORAGE_KEY = "duelverse_immersive_settings_v1";
const ENABLED_KEY = "duelverse_immersive_enabled_v1";

type Ctx = {
  /** True quando o modo está visualmente ativo (ambos com Arena aberta + toggle global on). */
  active: boolean;
  /** Toggle global do usuário — permite desligar mesmo com Arena aberta. */
  userEnabled: boolean;
  setUserEnabled: (v: boolean) => void;
  settings: ImmersiveSettings;
  updateSetting: <K extends keyof ImmersiveSettings>(key: K, value: ImmersiveSettings[K]) => void;
  resetSettings: () => void;
  /** Estado das aberturas de Arena Digital (local + remoto), alimentado pelo DuelRoom. */
  setArenaState: (state: { localOpen: boolean; remoteOpen: boolean }) => void;
  /** Painel de configurações (Sheet) aberto. */
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;
};

const ImmersiveCtx = createContext<Ctx | null>(null);

export const ImmersiveModeProvider = ({ children }: { children: ReactNode }) => {
  const [settings, setSettings] = useState<ImmersiveSettings>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {}
    return DEFAULTS;
  });
  const [userEnabled, setUserEnabledState] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(ENABLED_KEY);
      return v === null ? true : v === "1";
    } catch {
      return true;
    }
  });
  const [arena, setArena] = useState({ localOpen: false, remoteOpen: false });
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Persistência
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {}
  }, [settings]);

  const setUserEnabled = useCallback((v: boolean) => {
    setUserEnabledState(v);
    try {
      localStorage.setItem(ENABLED_KEY, v ? "1" : "0");
    } catch {}
  }, []);

  const updateSetting: Ctx["updateSetting"] = useCallback((key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetSettings = useCallback(() => setSettings(DEFAULTS), []);

  const setArenaState = useCallback(
    (state: { localOpen: boolean; remoteOpen: boolean }) => {
      setArena((prev) =>
        prev.localOpen === state.localOpen && prev.remoteOpen === state.remoteOpen ? prev : state
      );
    },
    []
  );

  const active = userEnabled && arena.localOpen && arena.remoteOpen;

  // Aplica classes globais de acessibilidade no <html>
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("immersive-large-fonts", active && settings.largeFonts);
    root.classList.toggle("immersive-high-contrast", active && settings.highContrast);
    root.dataset.colorblind = active ? settings.colorblindMode : "off";
    return () => {
      root.classList.remove("immersive-large-fonts");
      root.classList.remove("immersive-high-contrast");
      delete root.dataset.colorblind;
    };
  }, [active, settings.largeFonts, settings.highContrast, settings.colorblindMode]);

  const value = useMemo<Ctx>(
    () => ({
      active,
      userEnabled,
      setUserEnabled,
      settings,
      updateSetting,
      resetSettings,
      setArenaState,
      settingsOpen,
      setSettingsOpen,
    }),
    [active, userEnabled, setUserEnabled, settings, updateSetting, resetSettings, setArenaState, settingsOpen]
  );

  return <ImmersiveCtx.Provider value={value}>{children}</ImmersiveCtx.Provider>;
};

export const useImmersiveMode = () => {
  const ctx = useContext(ImmersiveCtx);
  if (!ctx) throw new Error("useImmersiveMode deve ser usado dentro de ImmersiveModeProvider");
  return ctx;
};
