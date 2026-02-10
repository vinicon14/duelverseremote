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
      
      // Language parameter - start with requested language
      if (language === 'pt') {
        params.append('language', 'pt');
      }

      const url = `https://db.ygoprodeck.com/api/v7/cardinfo.php?${params.toString()}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        if (response.status === 400) {
          // If Portuguese search returns 400, try English
          if (language === 'pt') {
            const englishParams = new URLSearchParams(params);
            englishParams.delete('language');
            const englishUrl = `https://db.ygoprodeck.com/api/v7/cardinfo.php?${englishParams.toString()}`;
            const englishResponse = await fetch(englishUrl);
            
            if (englishResponse.ok) {
              const englishData = await englishResponse.json();
              setCards(englishData.data || []);
              return;
            }
          }
          setCards([]);
          return;
        }
        throw new Error('Erro ao buscar cartas');
      }

      const data = await response.json();
      
      // If Portuguese search returns no results, try English
      if ((!data.data || data.data.length === 0) && language === 'pt') {
        const englishParams = new URLSearchParams(params);
        englishParams.delete('language');
        const englishUrl = `https://db.ygoprodeck.com/api/v7/cardinfo.php?${englishParams.toString()}`;
        
        try {
          const englishResponse = await fetch(englishUrl);
          if (englishResponse.ok) {
            const englishData = await englishResponse.json();
            setCards(englishData.data || []);
            return;
          }
        } catch {}
      }
      
      setCards(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const getCardById = useCallback(async (id: number, language: Language = 'pt'): Promise<YugiohCard | null> => {
    try {
      const langParam = language === 'pt' ? '&language=pt' : '';
      const response = await fetch(
        `https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${id}${langParam}`
      );
      
      if (!response.ok) {
        // If Portuguese fetch fails, try English
        if (language === 'pt') {
          const englishResponse = await fetch(
            `https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${id}`
          );
          if (englishResponse.ok) {
            const englishData = await englishResponse.json();
            return englishData.data?.[0] || null;
          }
        }
        return null;
      }
      
      const data = await response.json();
      const card = data.data?.[0];
      
      // If Portuguese fetch returns no data, try English
      if (!card && language === 'pt') {
        const englishResponse = await fetch(
          `https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${id}`
        );
        if (englishResponse.ok) {
          const englishData = await englishResponse.json();
          return englishData.data?.[0] || null;
        }
      }
      
      return card || null;
    } catch {
      // Try English as fallback on error
      if (language === 'pt') {
        try {
          const englishResponse = await fetch(
            `https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${id}`
          );
          if (englishResponse.ok) {
            const englishData = await englishResponse.json();
            return englishData.data?.[0] || null;
          }
        } catch {}
      }
      return null;
    }
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
