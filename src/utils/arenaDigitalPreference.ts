export const ARENA_DIGITAL_PREF_KEY = "duelverse_arena_digital_enabled_v1";

export const loadArenaDigitalPreference = () => {
  try {
    return localStorage.getItem(ARENA_DIGITAL_PREF_KEY) !== "0";
  } catch {
    return true;
  }
};

export const saveArenaDigitalPreference = (enabled: boolean) => {
  try {
    localStorage.setItem(ARENA_DIGITAL_PREF_KEY, enabled ? "1" : "0");
  } catch {
    return;
  }
};
