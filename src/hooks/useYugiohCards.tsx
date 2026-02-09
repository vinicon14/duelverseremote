import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

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

      // 1. Standard Search (PT if language=pt)
      const fetchStandard = fetch(url).then(r => r.ok ? r.json() : null).catch(() => null);

      // 2. English Search (Fallback/Supplement)
      // Always fetch English results if we are in PT mode to ensure coverage
      let fetchEnglish: Promise<any> = Promise.resolve(null);
      if (language === 'pt') {
        const englishParams = new URLSearchParams(params);
        englishParams.delete('language');
        const englishUrl = `https://db.ygoprodeck.com/api/v7/cardinfo.php?${englishParams.toString()}`;
        fetchEnglish = fetch(englishUrl).then(r => r.ok ? r.json() : null).catch(() => null);
      }

      // 3. AI Search (Semantic/Related)
      let aiPromise: Promise<any> = Promise.resolve(null);
      if (language === 'pt' && filters.name && filters.name.length > 2) {
        console.log("Iniciando busca IA para:", filters.name);
        aiPromise = supabase.functions.invoke('search-related-cards', {
          body: { query: filters.name, language: 'pt' }
        }).then(({ data, error }) => {
          if (error) {
            console.error("Erro na função AI:", error);
            return [];
          }
          return data?.suggestions || [];
        }).catch(err => {
          console.error("Erro ao chamar AI:", err);
          return [];
        });
      }

      // Wait for all requests
      const [standardData, englishData, aiSuggestions] = await Promise.all([fetchStandard, fetchEnglish, aiPromise]);

      let standardCards: YugiohCard[] = standardData?.data || [];
      let englishCards: YugiohCard[] = englishData?.data || [];

      // Fetch AI suggested cards if any
      let aiCards: YugiohCard[] = [];
      if (aiSuggestions && Array.isArray(aiSuggestions) && aiSuggestions.length > 0) {
        console.log("Sugestões da IA:", aiSuggestions);
        try {
          const namesToFetch = aiSuggestions.slice(0, 15);
          if (namesToFetch.length > 0) {
            const namesParam = namesToFetch.map((n: string) => encodeURIComponent(n)).join('|');
            const aiUrl = `https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${namesParam}`;
            const aiRes = await fetch(aiUrl);
            if (aiRes.ok) {
              const aiData = await aiRes.json();
              if (aiData.data) {
                aiCards = aiData.data;
              }
            }
          }
        } catch (e) {
          console.error("Erro buscando cartas da IA:", e);
        }
      }

      // MERGE LOGIC
      // 1. Start with English results (ensures we have every possible card match)
      const cardMap = new Map<number, YugiohCard>();
      englishCards.forEach(card => cardMap.set(card.id, card));

      // 2. Overwrite with Standard (Portuguese) results
      // This ensures if a translation exists, we use it.
      // If a card was missing in PT (standardCards) but found in EN (englishCards), the EN version remains.
      // If a card is in both, the PT version overwrites the EN one.
      standardCards.forEach(card => cardMap.set(card.id, card));

      // 3. Add AI results
      // AI suggestions are usually English names. We interpret them as "related" cards.
      // If the card is already found (via name match), we keep the version we have (PT preferred).
      // If it's a new related card, we add it.
      aiCards.forEach(card => {
        if (!cardMap.has(card.id)) {
          cardMap.set(card.id, card);
        }
      });

      const finalCards = Array.from(cardMap.values());

      if (finalCards.length === 0) {
        // Only throw error if absolutely nothing was found
        const errorMessage = language === 'pt' ? 'Nenhuma carta encontrada' : 'No cards found';
        throw new Error(errorMessage);
      }

      setCards(finalCards);

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
        } catch { }
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
