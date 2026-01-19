import { useState, useCallback } from 'react';
import { Navbar } from '@/components/Navbar';
import { CardSearchPanel } from '@/components/deckbuilder/CardSearchPanel';
import { DeckPanel, DeckCard } from '@/components/deckbuilder/DeckPanel';
import { CardDetailModal } from '@/components/deckbuilder/CardDetailModal';
import { YugiohCard, Language } from '@/hooks/useYugiohCards';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Layers, Search, Globe } from 'lucide-react';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';

const EXTRA_DECK_TYPES = ['Fusion', 'Synchro', 'XYZ', 'Link'];

const isExtraDeckCard = (card: YugiohCard): boolean => {
  return EXTRA_DECK_TYPES.some((type) => card.type.includes(type));
};

const DeckBuilder = () => {
  const [language, setLanguage] = useState<Language>('pt');
  const [mainDeck, setMainDeck] = useState<DeckCard[]>([]);
  const [extraDeck, setExtraDeck] = useState<DeckCard[]>([]);
  const [sideDeck, setSideDeck] = useState<DeckCard[]>([]);
  const [selectedCard, setSelectedCard] = useState<YugiohCard | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'search' | 'deck'>('search');

  const labels = {
    en: {
      title: 'Deck Builder',
      search: 'Search',
      deck: 'Deck',
      cardAdded: 'Card added to deck',
      cardRemoved: 'Card removed from deck',
      deckCleared: 'Deck cleared',
      maxCopies: 'Maximum 3 copies per card',
      deckFull: 'Deck is full',
      deckExported: 'Deck exported',
      invalidDeck: 'Invalid deck file',
      deckImported: 'Deck imported successfully',
    },
    pt: {
      title: 'Deck Builder',
      search: 'Buscar',
      deck: 'Deck',
      cardAdded: 'Carta adicionada ao deck',
      cardRemoved: 'Carta removida do deck',
      deckCleared: 'Deck limpo',
      maxCopies: 'Máximo de 3 cópias por carta',
      deckFull: 'Deck está cheio',
      deckExported: 'Deck exportado',
      invalidDeck: 'Arquivo de deck inválido',
      deckImported: 'Deck importado com sucesso',
    },
  };

  const t = labels[language];

  const getCardCount = (cardId: number): number => {
    const mainCount = mainDeck.find((c) => c.id === cardId)?.quantity || 0;
    const extraCount = extraDeck.find((c) => c.id === cardId)?.quantity || 0;
    const sideCount = sideDeck.find((c) => c.id === cardId)?.quantity || 0;
    return mainCount + extraCount + sideCount;
  };

  const getTotalCount = (deck: DeckCard[]): number => {
    return deck.reduce((acc, c) => acc + c.quantity, 0);
  };

  const handleCardClick = (card: YugiohCard) => {
    setSelectedCard(card);
    setModalOpen(true);
  };

  const handleAddToDeck = useCallback(
    (card: YugiohCard, deckType: 'main' | 'extra' | 'side') => {
      const totalCopies = getCardCount(card.id);
      
      if (totalCopies >= 3) {
        toast.error(t.maxCopies);
        return;
      }

      const updateDeck = (
        deck: DeckCard[],
        setDeck: React.Dispatch<React.SetStateAction<DeckCard[]>>,
        maxCards: number
      ) => {
        const total = getTotalCount(deck);
        if (total >= maxCards) {
          toast.error(t.deckFull);
          return;
        }

        const existing = deck.find((c) => c.id === card.id);
        if (existing) {
          setDeck(
            deck.map((c) =>
              c.id === card.id ? { ...c, quantity: c.quantity + 1 } : c
            )
          );
        } else {
          setDeck([...deck, { ...card, quantity: 1 }]);
        }
        toast.success(t.cardAdded);
      };

      if (deckType === 'main') {
        updateDeck(mainDeck, setMainDeck, 60);
      } else if (deckType === 'extra') {
        updateDeck(extraDeck, setExtraDeck, 15);
      } else {
        updateDeck(sideDeck, setSideDeck, 15);
      }
    },
    [mainDeck, extraDeck, sideDeck, t]
  );

  const handleRemoveCard = (cardId: number, deckType: 'main' | 'extra' | 'side') => {
    const setDeck =
      deckType === 'main' ? setMainDeck : deckType === 'extra' ? setExtraDeck : setSideDeck;
    
    setDeck((prev) => prev.filter((c) => c.id !== cardId));
    toast.success(t.cardRemoved);
  };

  const handleAddQuantity = (cardId: number, deckType: 'main' | 'extra' | 'side') => {
    const totalCopies = getCardCount(cardId);
    if (totalCopies >= 3) {
      toast.error(t.maxCopies);
      return;
    }

    const setDeck =
      deckType === 'main' ? setMainDeck : deckType === 'extra' ? setExtraDeck : setSideDeck;
    const deck = deckType === 'main' ? mainDeck : deckType === 'extra' ? extraDeck : sideDeck;
    const maxCards = deckType === 'main' ? 60 : 15;

    if (getTotalCount(deck) >= maxCards) {
      toast.error(t.deckFull);
      return;
    }

    setDeck((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, quantity: c.quantity + 1 } : c))
    );
  };

  const handleRemoveQuantity = (cardId: number, deckType: 'main' | 'extra' | 'side') => {
    const setDeck =
      deckType === 'main' ? setMainDeck : deckType === 'extra' ? setExtraDeck : setSideDeck;

    setDeck((prev) =>
      prev
        .map((c) => (c.id === cardId ? { ...c, quantity: c.quantity - 1 } : c))
        .filter((c) => c.quantity > 0)
    );
  };

  const handleClearDeck = () => {
    setMainDeck([]);
    setExtraDeck([]);
    setSideDeck([]);
    toast.success(t.deckCleared);
  };

  const handleExportDeck = () => {
    const deckData = {
      main: mainDeck.map((c) => ({ id: c.id, name: c.name, quantity: c.quantity })),
      extra: extraDeck.map((c) => ({ id: c.id, name: c.name, quantity: c.quantity })),
      side: sideDeck.map((c) => ({ id: c.id, name: c.name, quantity: c.quantity })),
    };

    const ydk = generateYDK();
    
    const blob = new Blob([ydk], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'deck.ydk';
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t.deckExported);
  };

  const generateYDK = (): string => {
    let ydk = '#created by DuelVerse Deck Builder\n#main\n';
    mainDeck.forEach((card) => {
      for (let i = 0; i < card.quantity; i++) {
        ydk += `${card.id}\n`;
      }
    });
    ydk += '#extra\n';
    extraDeck.forEach((card) => {
      for (let i = 0; i < card.quantity; i++) {
        ydk += `${card.id}\n`;
      }
    });
    ydk += '!side\n';
    sideDeck.forEach((card) => {
      for (let i = 0; i < card.quantity; i++) {
        ydk += `${card.id}\n`;
      }
    });
    return ydk;
  };

  const handleImportDeck = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ydk,.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const text = await file.text();
      
      if (file.name.endsWith('.ydk')) {
        await importYDK(text);
      } else {
        try {
          const data = JSON.parse(text);
          // Handle JSON import if needed
        } catch {
          toast.error(t.invalidDeck);
        }
      }
    };
    input.click();
  };

  const importYDK = async (content: string) => {
    const lines = content.split('\n');
    let currentSection = '';
    const mainIds: number[] = [];
    const extraIds: number[] = [];
    const sideIds: number[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '#main') {
        currentSection = 'main';
      } else if (trimmed === '#extra') {
        currentSection = 'extra';
      } else if (trimmed === '!side') {
        currentSection = 'side';
      } else if (trimmed && !trimmed.startsWith('#')) {
        const id = parseInt(trimmed);
        if (!isNaN(id)) {
          if (currentSection === 'main') mainIds.push(id);
          else if (currentSection === 'extra') extraIds.push(id);
          else if (currentSection === 'side') sideIds.push(id);
        }
      }
    }

    // Fetch card data for all IDs
    const allIds = [...new Set([...mainIds, ...extraIds, ...sideIds])];
    
    try {
      const response = await fetch(
        `https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${allIds.join(',')}&language=${language}`
      );
      const data = await response.json();
      const cardsMap = new Map<number, YugiohCard>();
      
      data.data?.forEach((card: YugiohCard) => {
        cardsMap.set(card.id, card);
      });

      const buildDeck = (ids: number[]): DeckCard[] => {
        const countMap = new Map<number, number>();
        ids.forEach((id) => countMap.set(id, (countMap.get(id) || 0) + 1));
        
        return Array.from(countMap.entries())
          .map(([id, quantity]) => {
            const card = cardsMap.get(id);
            if (!card) return null;
            return { ...card, quantity: Math.min(quantity, 3) };
          })
          .filter(Boolean) as DeckCard[];
      };

      setMainDeck(buildDeck(mainIds));
      setExtraDeck(buildDeck(extraIds));
      setSideDeck(buildDeck(sideIds));
      toast.success(t.deckImported);
    } catch {
      toast.error(t.invalidDeck);
    }
  };

  const canAddToMain = selectedCard
    ? !isExtraDeckCard(selectedCard) &&
      getTotalCount(mainDeck) < 60 &&
      getCardCount(selectedCard.id) < 3
    : false;

  const canAddToExtra = selectedCard
    ? isExtraDeckCard(selectedCard) &&
      getTotalCount(extraDeck) < 15 &&
      getCardCount(selectedCard.id) < 3
    : false;

  const canAddToSide = selectedCard
    ? getTotalCount(sideDeck) < 15 && getCardCount(selectedCard.id) < 3
    : false;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="pt-16 h-screen flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">{t.title}</h1>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant={language === 'pt' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setLanguage('pt')}
              className="gap-1"
            >
              <Globe className="h-3 w-3" />
              PT
            </Button>
            <Button
              variant={language === 'en' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setLanguage('en')}
              className="gap-1"
            >
              <Globe className="h-3 w-3" />
              EN
            </Button>
          </div>
        </div>

        {/* Mobile Tabs */}
        <div className="md:hidden flex-1 flex flex-col">
          <Tabs value={mobileTab} onValueChange={(v) => setMobileTab(v as 'search' | 'deck')} className="flex-1 flex flex-col">
            <TabsList className="w-full grid grid-cols-2 rounded-none">
              <TabsTrigger value="search" className="gap-2">
                <Search className="h-4 w-4" />
                {t.search}
              </TabsTrigger>
              <TabsTrigger value="deck" className="gap-2">
                <Layers className="h-4 w-4" />
                {t.deck}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="search" className="flex-1 mt-0">
              <CardSearchPanel language={language} onCardClick={handleCardClick} />
            </TabsContent>
            <TabsContent value="deck" className="flex-1 mt-0">
              <DeckPanel
                mainDeck={mainDeck}
                extraDeck={extraDeck}
                sideDeck={sideDeck}
                language={language}
                onRemoveCard={handleRemoveCard}
                onAddQuantity={handleAddQuantity}
                onRemoveQuantity={handleRemoveQuantity}
                onClearDeck={handleClearDeck}
                onExportDeck={handleExportDeck}
                onImportDeck={handleImportDeck}
                onCardClick={handleCardClick}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Desktop Resizable Panels */}
        <div className="hidden md:flex flex-1 overflow-hidden">
          <ResizablePanelGroup direction="horizontal">
            <ResizablePanel defaultSize={35} minSize={25} maxSize={50}>
              <CardSearchPanel language={language} onCardClick={handleCardClick} />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={65}>
              <DeckPanel
                mainDeck={mainDeck}
                extraDeck={extraDeck}
                sideDeck={sideDeck}
                language={language}
                onRemoveCard={handleRemoveCard}
                onAddQuantity={handleAddQuantity}
                onRemoveQuantity={handleRemoveQuantity}
                onClearDeck={handleClearDeck}
                onExportDeck={handleExportDeck}
                onImportDeck={handleImportDeck}
                onCardClick={handleCardClick}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>

      {/* Card Detail Modal */}
      <CardDetailModal
        card={selectedCard}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onAddToDeck={handleAddToDeck}
        language={language}
        canAddToMain={canAddToMain}
        canAddToExtra={canAddToExtra}
        canAddToSide={canAddToSide}
        isExtraDeckCard={selectedCard ? isExtraDeckCard(selectedCard) : false}
      />
    </div>
  );
};

export default DeckBuilder;
