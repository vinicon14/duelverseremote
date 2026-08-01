/**
 * DuelVerse - Hook de Cartas Yu-Gi-Oh!
 * Desenvolvido por Vinícius
 * 
 * Hook para buscar e gerenciar cartas do banco de dados Yu-Gi-Oh!.
 * Fornece interface de busca e cache local.
 */
import { useState, useCallback } from 'react';

export interface YugiohCard {
  id: number;
  name: string;
  type: string;
  desc: string;
  atk?: number;
  def?: number;
  level?: number;
  race: string;
  attribute?: string;
  archetype?: string;
  scale?: number;
  linkval?: number;
  linkmarkers?: string[];
  card_images: {
    id: number;
    image_url: string;
    image_url_small: string;
    image_url_cropped: string;
  }[];
  banlist_info?: {
    ban_tcg?: string;
    ban_ocg?: string;
    ban_goat?: string;
  };

}

export interface CardFilters {
  name?: string;
  type?: string;
  race?: string;
  attribute?: string;
  level?: string;
  atk?: string;
  def?: string;
  archetype?: string;
}

export type Language = 'en' | 'pt';

const CARD_TYPES = [
  'Effect Monster',
  'Flip Effect Monster',
  'Fusion Monster',
  'Link Monster',
  'Normal Monster',
  'Pendulum Effect Monster',
  'Pendulum Normal Monster',
  'Ritual Effect Monster',
  'Ritual Monster',
  'Spell Card',
  'Spirit Monster',
  'Synchro Monster',
  'Synchro Pendulum Effect Monster',
  'Trap Card',
  'Tuner Monster',
  'XYZ Monster',
  'XYZ Pendulum Effect Monster',
];

const ATTRIBUTES = ['DARK', 'LIGHT', 'EARTH', 'WATER', 'FIRE', 'WIND', 'DIVINE'];

const MONSTER_RACES = [
  'Aqua', 'Beast', 'Beast-Warrior', 'Creator-God', 'Cyberse', 'Dinosaur',
  'Divine-Beast', 'Dragon', 'Fairy', 'Fiend', 'Fish', 'Illusion', 'Insect',
  'Machine', 'Plant', 'Psychic', 'Pyro', 'Reptile', 'Rock', 'Sea Serpent',
  'Spellcaster', 'Thunder', 'Warrior', 'Winged Beast', 'Wyrm', 'Zombie'
];

const SPELL_RACES = ['Normal', 'Field', 'Equip', 'Continuous', 'Quick-Play', 'Ritual'];
const TRAP_RACES = ['Normal', 'Continuous', 'Counter'];

export const useYugiohCards = () => {
  const [cards, setCards] = useState<YugiohCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchCards = useCallback(async (filters: CardFilters, language: Language = 'pt') => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      
      if (filters.name) {
        params.append('fname', filters.name);
      }
      if (filters.type) {
        params.append('type', filters.type);
      }
      if (filters.race) {
        params.append('race', filters.race);
      }
      if (filters.attribute) {
        params.append('attribute', filters.attribute);
      }
      if (filters.level) {
        params.append('level', filters.level);
      }
      if (filters.atk) {
        params.append('atk', filters.atk);
      }
      if (filters.def) {
        params.append('def', filters.def);
      }
      if (filters.archetype) {
        params.append('archetype', filters.archetype);
      }
      
      // Busca EN (base sempre atualizada) + PT (traduções, que ficam defasadas)
      const base = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';
      const enParams = new URLSearchParams(params);
      const ptParams = new URLSearchParams(params);
      ptParams.append('language', 'pt');

      const fetchList = async (u: string): Promise<YugiohCard[]> => {
        try {
          const res = await fetch(u, { cache: 'no-store' });
          if (!res.ok) return [];
          const json = await res.json();
          return Array.isArray(json.data) ? json.data : [];
        } catch {
          return [];
        }
      };

      const [enCards, ptCards] = await Promise.all([
        fetchList(`${base}?${enParams.toString()}`),
        language === 'pt' ? fetchList(`${base}?${ptParams.toString()}`) : Promise.resolve([]),
      ]);

      // Mescla: nome/descrição em PT quando existir, mas mantém TODAS as cartas EN
      // (cartas novas que ainda não têm tradução deixam de sumir da busca).
      const ptById = new Map(ptCards.map((c) => [c.id, c]));
      const merged: YugiohCard[] = enCards.map((c) => {
        const pt = ptById.get(c.id);
        return pt ? { ...c, name: pt.name, desc: pt.desc } : c;
      });

      // Cartas que só aparecem no índice PT (raro, mas garante cobertura total)
      const enIds = new Set(enCards.map((c) => c.id));
      for (const pt of ptCards) if (!enIds.has(pt.id)) merged.push(pt);

      setCards(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, []);


  const getCardById = useCallback(async (id: number, language: Language = 'pt'): Promise<YugiohCard | null> => {
    const base = 'https://db.ygoprodeck.com/api/v7/cardinfo.php';
    const fetchOne = async (u: string): Promise<YugiohCard | null> => {
      try {
        const res = await fetch(u, { cache: 'no-store' });
        if (!res.ok) return null;
        const json = await res.json();
        return json.data?.[0] || null;
      } catch {
        return null;
      }
    };

    const [en, pt] = await Promise.all([
      fetchOne(`${base}?id=${id}`),
      language === 'pt' ? fetchOne(`${base}?id=${id}&language=pt`) : Promise.resolve(null),
    ]);

    if (en && pt) return { ...en, name: pt.name, desc: pt.desc };
    return en || pt;
  }, []);


  const fetchArchetypes = useCallback(async (): Promise<string[]> => {
    try {
      const response = await fetch('https://db.ygoprodeck.com/api/v7/archetypes.php');
      if (!response.ok) return [];
      
      const data = await response.json();
      return data.map((a: { archetype_name: string }) => a.archetype_name);
    } catch {
      return [];
    }
  }, []);

  return {
    cards,
    loading,
    error,
    searchCards,
    getCardById,
    fetchArchetypes,
    CARD_TYPES,
    ATTRIBUTES,
    MONSTER_RACES,
    SPELL_RACES,
    TRAP_RACES,
  };
};
