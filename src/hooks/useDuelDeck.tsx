import { useState, useCallback } from 'react';
import { DeckCard } from '@/components/deckbuilder/DeckPanel';
import { YugiohCard, useYugiohCards } from '@/hooks/useYugiohCards';
import { useToast } from '@/components/ui/use-toast';

export const useDuelDeck = () => {
  const [mainDeck, setMainDeck] = useState<DeckCard[]>([]);
  const [extraDeck, setExtraDeck] = useState<DeckCard[]>([]);
  const [sideDeck, setSideDeck] = useState<DeckCard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { getCardById } = useYugiohCards();
  const { toast } = useToast();

  const isExtraDeckCard = (type: string): boolean => {
    const extraTypes = ['Fusion Monster', 'Synchro Monster', 'XYZ Monster', 'Link Monster', 
                        'Synchro Pendulum Effect Monster', 'XYZ Pendulum Effect Monster',
                        'Pendulum Fusion Monster', 'Pendulum Synchro Monster', 'Pendulum XYZ Monster'];
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

  const importDeckFromYDK = useCallback(async (file: File) => {
    setIsLoading(true);
    try {
      const content = await file.text();
      const result = await parseYDKContent(content);
      
      setMainDeck(result.main);
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
        description: "Não foi possível importar o arquivo .ydk",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [parseYDKContent, toast]);

  const clearDeck = useCallback(() => {
    setMainDeck([]);
    setExtraDeck([]);
    setSideDeck([]);
  }, []);

  const hasDeck = mainDeck.length > 0 || extraDeck.length > 0;

  const [tokensDeck, setTokensDeck] = useState<DeckCard[]>([]);

  const returnAllToDeck = useCallback(() => {
    // ... logic would go here if needed, but it's handled in DuelDeckViewer
  }, []);

  return {
    mainDeck,
    extraDeck,
    sideDeck,
    tokensDeck,
    setMainDeck,
    setExtraDeck,
    setSideDeck,
    setTokensDeck,
    isLoading,
    hasDeck,
    importDeckFromYDK,
    clearDeck,
  };
};
