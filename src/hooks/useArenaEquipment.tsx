/**
 * DuelVerse - Equipamentos da Arena
 * Hook reativo para playmat/sleeve equipados (armazenados em localStorage).
 */
import { useCallback, useEffect, useState } from 'react';

export const ARENA_EQUIPMENT_EVENT = 'arena-equipment-changed';

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export interface ArenaEquipmentState {
  playmatUrl: string | null;
  playmatId: string | null;
  sleeveUrl: string | null;
  sleeveId: string | null;
}

const snapshot = (): ArenaEquipmentState => ({
  playmatUrl: read('activePlaymatUrl'),
  playmatId: read('activePlaymatId'),
  sleeveUrl: read('activeSleeveUrl'),
  sleeveId: read('activeSleeveId'),
});

export const setArenaEquipment = (
  kind: 'playmat' | 'sleeve',
  value: { id: string; url: string } | null
) => {
  const urlKey = kind === 'playmat' ? 'activePlaymatUrl' : 'activeSleeveUrl';
  const idKey = kind === 'playmat' ? 'activePlaymatId' : 'activeSleeveId';
  try {
    if (value) {
      localStorage.setItem(urlKey, value.url);
      localStorage.setItem(idKey, value.id);
    } else {
      localStorage.removeItem(urlKey);
      localStorage.removeItem(idKey);
    }
  } catch {
    // ignore storage errors
  }
  window.dispatchEvent(new CustomEvent(ARENA_EQUIPMENT_EVENT));
};

export const useArenaEquipment = () => {
  const [state, setState] = useState<ArenaEquipmentState>(() =>
    typeof window === 'undefined'
      ? { playmatUrl: null, playmatId: null, sleeveUrl: null, sleeveId: null }
      : snapshot()
  );

  const refresh = useCallback(() => setState(snapshot()), []);

  useEffect(() => {
    refresh();
    window.addEventListener(ARENA_EQUIPMENT_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(ARENA_EQUIPMENT_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [refresh]);

  return { ...state, setEquipment: setArenaEquipment, refresh };
};
