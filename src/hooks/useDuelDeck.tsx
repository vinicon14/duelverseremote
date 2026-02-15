import { useState, useCallback } from 'react';
import { DeckCard } from '@/components/deckbuilder/DeckPanel';
import { YugiohCard, useYugiohCards } from '@/hooks/useYugiohCards';
import { useToast } from '@/components/ui/use-toast';

export const useDuelDeck = () => {
  const [mainDeck, setMainDeck] = useState<DeckCard[]>([]);
  const [extraDeck, setExtraDeck] = useState<DeckCard[]>([]);
  const [tokensDeck, setTokensDeck] = useState<DeckCard[]>([]);
  const [sideDeck, setSideDeck] = useState<DeckCard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { getCardById, getCardByName } = useYugiohCards();
  const { toast } = useToast();

  const isExtraDeckCard = (type: string): boolean => {
    const extraTypes = ['Fusion Monster', 'Synchro Monster', 'XYZ Monster', 'Link Monster', 
                        'Synchro Pendulum Effect Monster', 'XYZ Pendulum Effect Monster'];
    return extraTypes.some(t => type.includes(t));
  };

  const parseYDKContent = useCallback(async (content: string): Promise<{
    main: DeckCard[];
    extra: DeckCard[];
    side: DeckCard[];
  }> => {
    const lines = content.split('\n').map(l => l.trim());
    const main: number[] = [];
    const extra: number[] = [];
    const side: number[] = [];
    
    let currentSection = 'main';
    
    for (const line of lines) {
      if (line === '#main') {
        currentSection = 'main';
        continue;
      }
      if (line === '#extra') {
        currentSection = 'extra';
        continue;
      }
      if (line === '!side') {
        currentSection = 'side';
        continue;
      }
      
      const id = parseInt(line);
      if (!isNaN(id) && id > 0) {
        if (currentSection === 'main') main.push(id);
        else if (currentSection === 'extra') extra.push(id);
        else side.push(id);
      }
    }

    // Agrupar por ID e contar quantidade
    const groupById = (ids: number[]): Map<number, number> => {
      const map = new Map<number, number>();
      ids.forEach(id => map.set(id, (map.get(id) || 0) + 1));
      return map;
    };

    const mainGrouped = groupById(main);
    const extraGrouped = groupById(extra);
    const sideGrouped = groupById(side);

    // Buscar dados das cartas - tentar português primeiro, depois inglês
    const fetchCards = async (grouped: Map<number, number>): Promise<DeckCard[]> => {
      const cards: DeckCard[] = [];
      const notFound: number[] = [];
      
      // Primeiro, tentar buscar em português
      for (const [id, quantity] of grouped.entries()) {
        const cardData = await getCardById(id, 'pt');
        if (cardData) {
          cards.push({ ...cardData, quantity });
        } else {
          notFound.push(id);
        }
      }
      
      // Para os não encontrados, tentar em inglês
      for (const id of notFound) {
        const quantity = grouped.get(id) || 1;
        const cardData = await getCardById(id, 'en');
        if (cardData) {
          cards.push({ ...cardData, quantity });
        } else {
          console.warn(`Card with ID ${id} not found in any language`);
        }
      }
      
      return cards;
    };

    const [mainCards, extraCards, sideCards] = await Promise.all([
      fetchCards(mainGrouped),
      fetchCards(extraGrouped),
      fetchCards(sideGrouped),
    ]);

    return { main: mainCards, extra: extraCards, side: sideCards };
  }, [getCardById]);

  // Parse deck de texto (formato Neuron)
  const parseTextDeck = useCallback(async (content: string): Promise<{
    main: DeckCard[];
    extra: DeckCard[];
    side: DeckCard[];
  }> => {
    const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    const mainCards: DeckCard[] = [];
    const extraCards: DeckCard[] = [];
    const sideCards: DeckCard[] = [];
    
    let currentSection = 'main';
    const cardQuantities = new Map<string, number>();
    
    for (const line of lines) {
      // Detectar seção
      const lowerLine = line.toLowerCase();
      if (lowerLine.includes('main deck') || lowerLine === '#main') {
        currentSection = 'main';
        continue;
      }
      if (lowerLine.includes('extra deck') || lowerLine === '#extra') {
        currentSection = 'extra';
        continue;
      }
      if (lowerLine.includes('side deck') || lowerLine === '!side' || lowerLine === '#side') {
        currentSection = 'side';
        continue;
      }
      
      // Skip headers like "Main Deck", "Extra Deck", etc.
      if (/^(main|extra|side)\s*deck$/i.test(line)) continue;
      
      // Parse quantidade e nome da carta
      // Formatos: "3 Dark Magician" ou "Dark Magician" (sem número = 1)
      const match = line.match(/^(\d+)?\s*(.+)$/);
      if (!match) continue;
      
      const quantity = match[1] ? parseInt(match[1]) : 1;
      const cardName = match[2].trim();
      
      if (!cardName) continue;
      
      // Agrupar por nome
      const key = cardName.toLowerCase();
      cardQuantities.set(key, (cardQuantities.get(key) || 0) + quantity);
    }
    
    // Buscar cartas pelo nome
    for (const [cardName, quantity] of cardQuantities) {
      const card = await getCardByName(cardName, 'pt');
      
      if (card) {
        const deckCard: DeckCard = {
          id: card.id,
          name: card.name,
          type: card.type,
          desc: card.desc,
          atk: card.atk,
          def: card.def,
          level: card.level,
          race: card.race,
          attribute: card.attribute,
          archetype: card.archetype,
          scale: card.scale,
          linkval: card.linkval,
          linkmarkers: card.linkmarkers,
          card_images: card.card_images,
          quantity,
        };
        
        // Determinar seção baseada no tipo da carta
        const isExtra = isExtraDeckCard(card.type);
        
        if (currentSection === 'main' && !isExtra) {
          mainCards.push(deckCard);
        } else if (currentSection === 'extra' || isExtra) {
          extraCards.push(deckCard);
        } else {
          mainCards.push(deckCard);
        }
      } else {
        console.warn('Carta não encontrada:', cardName);
      }
    }
    
    return { main: mainCards, extra: extraCards, side: sideCards };
  }, [getCardByName, isExtraDeckCard]);

  const importDeckFromYDK = useCallback(async (file: File) => {
    setIsLoading(true);
    try {
      const content = await file.text();
      const isYDK = content.includes('#main') || content.includes('#extra') || content.includes('!side');
      
      let result;
      if (isYDK) {
        // Formato YDK padrão (com IDs)
        result = await parseYDKContent(content);
      } else {
        // Formato texto (Neuron)
        result = await parseTextDeck(content);
      }
      
      setMainDeck(result.main);
      setTokensDeck([]);
      setExtraDeck(result.extra);
      setSideDeck(result.side);

      const totalCards = result.main.reduce((acc, c) => acc + c.quantity, 0) +
                        result.extra.reduce((acc, c) => acc + c.quantity, 0) +
                        result.side.reduce((acc, c) => acc + c.quantity, 0);

      toast({
        title: "✅ Deck importado!",
        description: `${totalCards} cartas carregadas com sucesso.`,
      });

      return true;
    } catch (error) {
      toast({
        title: "Erro ao importar",
        description: "Não foi possível importar o arquivo",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [parseYDKContent, toast]);

  const loadDeckFromSaved = useCallback((
    main: DeckCard[],
    extra: DeckCard[],
    tokens: DeckCard[],
    side: DeckCard[]
  ) => {
    setMainDeck(main);
    // Mesclar fichas com extra deck para exibição no duel
    const mergedExtra = [...extra, ...tokens];
    setExtraDeck(mergedExtra);
    setTokensDeck(tokens);
    setSideDeck(side);
  }, []);

  const clearDeck = useCallback(() => {
    setMainDeck([]);
    setExtraDeck([]);
    setTokensDeck([]);
    setSideDeck([]);
  }, []);

  const hasDeck = mainDeck.length > 0 || extraDeck.length > 0;

  return {
    mainDeck,
    extraDeck,
    tokensDeck,
    sideDeck,
    isLoading,
    hasDeck,
    importDeckFromYDK,
    loadDeckFromSaved,
    clearDeck,
  };
};
