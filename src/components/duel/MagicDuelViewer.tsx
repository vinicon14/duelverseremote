/**
 * DuelVerse - Magic Duel Deck Viewer
 * 
 * Viewer integrado para a arena de Magic, permitindo gerenciar deck e campo.
 * Simula um deck físico com todas as interações: comprar, embaralhar,
 * mover cartas entre zonas (mão, campo, cemitério, exílio, etc).
 */
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { MagicFieldBoard, MagicFieldState, MagicZoneType, MagicCard, MagicPhase } from './MagicFieldBoard';
import { getMagicCardImage, MTG_CARD_BACK } from './mtgCardImage';
import { Shuffle, Hand, ArrowDown, RotateCcw, Eye, Undo2, Search, BookOpen, ChevronDown as ChevronDownIcon, Swords, Shield } from 'lucide-react';
import { MtgCardDetailDialog } from './MtgCardDetailDialog';

const createInitialFieldState = (): MagicFieldState => ({
  battlefield: [],
  lands: [],
  hand: [],
  library: [],
  graveyard: [],
  exile: [],
  stack: [],
  commandZone: [],
});

interface MagicDuelViewerProps {
  isOpen: boolean;
  onClose: () => void;
  duelId?: string;
  currentUserId?: string;
  embedded?: boolean;
}

export const MagicDuelViewer = ({ isOpen, onClose, duelId, currentUserId, embedded = false }: MagicDuelViewerProps) => {
  const [fieldState, setFieldState] = useState<MagicFieldState>(createInitialFieldState);
  const [currentPhase, setCurrentPhase] = useState<MagicPhase>('untap');
  const [deckLoaded, setDeckLoaded] = useState(false);
  const [zoneViewerOpen, setZoneViewerOpen] = useState(false);
  const [viewingZone, setViewingZone] = useState<MagicZoneType>('graveyard');
  const [cardDetailOpen, setCardDetailOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<MagicCard | null>(null);
  const [selectedCardZone, setSelectedCardZone] = useState<MagicZoneType>('hand');

  useEffect(() => {
    if (!currentUserId || deckLoaded) return;

    const loadDeck = async () => {
      try {
        const { data } = await supabase
          .from('saved_decks')
          .select('*')
          .eq('user_id', currentUserId)
          .eq('tcg_type', 'magic')
          .order('updated_at', { ascending: false })
          .limit(1);

        if (data && data.length > 0) {
          const deck = data[0];
          const mainCards = (deck.main_deck as any[]) || [];

          const libraryCards: MagicCard[] = mainCards.flatMap((card: any) => {
            const copies: MagicCard[] = [];
            for (let i = 0; i < (card.quantity || 1); i++) {
              copies.push({
                id: card.id || card.name,
                name: card.name,
                type_line: card.type_line || card.type || '',
                oracle_text: card.oracle_text || '',
                mana_cost: card.mana_cost || '',
                power: card.power,
                toughness: card.toughness,
                image: card.image,
                image_url: card.image_url,
                image_uris: card.image_uris || undefined,
                card_faces: card.card_faces || undefined,
                instanceId: `${card.id || card.name}-${i}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                isTapped: false,
                isFaceDown: false,
              });
            }
            return copies;
          });

          for (let i = libraryCards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [libraryCards[i], libraryCards[j]] = [libraryCards[j], libraryCards[i]];
          }

          setFieldState((prev) => ({ ...prev, library: libraryCards }));
          setDeckLoaded(true);
        }
      } catch (err) {
        console.error('Error loading Magic deck:', err);
      }
    };

    loadDeck();
  }, [currentUserId, deckLoaded]);

  const drawCard = useCallback(() => {
    setFieldState((prev) => {
      if (prev.library.length === 0) return prev;
      const [drawn, ...rest] = prev.library;
      return { ...prev, library: rest, hand: [...prev.hand, drawn] };
    });
  }, []);

  const drawInitialHand = useCallback(() => {
    setFieldState((prev) => {
      const handSize = 7;
      const drawn = prev.library.slice(0, handSize);
      const rest = prev.library.slice(handSize);
      return { ...prev, library: rest, hand: [...prev.hand, ...drawn] };
    });
  }, []);

  const mulligan = useCallback(() => {
    setFieldState((prev) => {
      const allCards = [...prev.library, ...prev.hand];
      for (let i = allCards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allCards[i], allCards[j]] = [allCards[j], allCards[i]];
      }
      const drawn = allCards.slice(0, 7);
      const rest = allCards.slice(7);
      return { ...prev, library: rest, hand: drawn };
    });
  }, []);

  const shuffleLibrary = useCallback(() => {
    setFieldState((prev) => {
      const shuffled = [...prev.library];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return { ...prev, library: shuffled };
    });
  }, []);

  const untapAll = useCallback(() => {
    setFieldState((prev) => ({
      ...prev,
      battlefield: prev.battlefield.map((c) => ({ ...c, isTapped: false })),
      lands: prev.lands.map((c) => ({ ...c, isTapped: false })),
    }));
  }, []);

  const handleCardDrop = useCallback((targetZone: MagicZoneType, card: MagicCard) => {
    setFieldState((prev) => {
      const newState = { ...prev };

      for (const zone of Object.keys(newState) as MagicZoneType[]) {
        if (Array.isArray(newState[zone])) {
          (newState[zone] as MagicCard[]) = (newState[zone] as MagicCard[]).filter(
            (c) => c.instanceId !== card.instanceId
          );
        }
      }

      const targetCards = [...(newState[targetZone] as MagicCard[])];
      const movedCard = { ...card };

      if (targetZone === 'hand' || targetZone === 'library' || targetZone === 'graveyard' || targetZone === 'exile') {
        movedCard.isTapped = false;
        movedCard.isFaceDown = false;
      }

      targetCards.push(movedCard);
      (newState[targetZone] as MagicCard[]) = targetCards;

      return { ...newState };
    });
  }, []);

  const handleTapCard = useCallback((card: MagicCard) => {
    setFieldState((prev) => {
      const tapInZone = (cards: MagicCard[]) =>
        cards.map((c) => (c.instanceId === card.instanceId ? { ...c, isTapped: !c.isTapped } : c));
      return {
        ...prev,
        battlefield: tapInZone(prev.battlefield),
        lands: tapInZone(prev.lands),
      };
    });
  }, []);

  const handleCardClick = useCallback((card: MagicCard, zone: MagicZoneType) => {
    setSelectedCard(card);
    setSelectedCardZone(zone);
    setCardDetailOpen(true);
  }, []);

  const handleZoneClick = useCallback((zone: MagicZoneType) => {
    if (zone === 'graveyard' || zone === 'exile' || zone === 'stack' || zone === 'commandZone') {
      setViewingZone(zone);
      setZoneViewerOpen(true);
    }
  }, []);

  const moveCardTo = useCallback((targetZone: MagicZoneType) => {
    if (selectedCard) {
      handleCardDrop(targetZone, selectedCard);
      setCardDetailOpen(false);
      setSelectedCard(null);
    }
  }, [selectedCard, handleCardDrop]);

  const modifyCounters = useCallback((card: MagicCard, delta: number) => {
    setFieldState((prev) => {
      const updateInZone = (cards: MagicCard[]) =>
        cards.map((c) =>
          c.instanceId === card.instanceId
            ? { ...c, counters: Math.max(0, (c.counters || 0) + delta) }
            : c
        );
      return {
        ...prev,
        battlefield: updateInZone(prev.battlefield),
        lands: updateInZone(prev.lands),
      };
    });
  }, []);

  const toggleFaceDown = useCallback((card: MagicCard) => {
    setFieldState((prev) => {
      const flipInZone = (cards: MagicCard[]) =>
        cards.map((c) => (c.instanceId === card.instanceId ? { ...c, isFaceDown: !c.isFaceDown } : c));
      return {
        ...prev,
        battlefield: flipInZone(prev.battlefield),
        lands: flipInZone(prev.lands),
        hand: flipInZone(prev.hand),
        stack: flipInZone(prev.stack),
      };
    });
    setCardDetailOpen(false);
  }, []);

  const millCard = useCallback(() => {
    setFieldState((prev) => {
      if (prev.library.length === 0) return prev;
      const [top, ...rest] = prev.library;
      return { ...prev, library: rest, graveyard: [...prev.graveyard, top] };
    });
  }, []);

  const scryTop = useCallback(() => {
    setFieldState((prev) => {
      if (prev.library.length === 0) return prev;
      const topCard = prev.library[0];
      setSelectedCard(topCard);
      setSelectedCardZone('library');
      setCardDetailOpen(true);
      return prev;
    });
  }, []);

  // --- Search deck mechanic ---
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return fieldState.library;
    const q = searchQuery.toLowerCase();
    return fieldState.library.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.type_line || '').toLowerCase().includes(q)
    );
  }, [fieldState.library, searchQuery]);

  const searchAndPickCard = useCallback((card: MagicCard) => {
    setFieldState((prev) => ({
      ...prev,
      library: prev.library.filter((c) => c.instanceId !== card.instanceId),
      hand: [...prev.hand, card],
    }));
    setSearchOpen(false);
    setSearchQuery('');
    // After searching, shuffle library
    setFieldState((prev) => {
      const shuffled = [...prev.library];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return { ...prev, library: shuffled };
    });
  }, []);

  // Stable channel for broadcasting
  const [broadcastChannel, setBroadcastChannel] = useState<ReturnType<typeof supabase.channel> | null>(null);
  const [channelReady, setChannelReady] = useState(false);
  const broadcastStateRef = useRef<() => void>(() => {});
  const isOpenRef = useRef(isOpen);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  // Create channel once
  useEffect(() => {
    if (!duelId || !currentUserId) return;

    const channel = supabase.channel(`deck-sync-${duelId}`, {
      config: { broadcast: { self: false } },
    });
    channel
      .on('broadcast', { event: 'deck-state-request' }, ({ payload }) => {
        if (payload?.requesterId === currentUserId) return;
        if (payload?.requestedOpponentId && payload.requestedOpponentId !== currentUserId) return;

        if (isOpenRef.current) {
          broadcastStateRef.current();
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setBroadcastChannel(channel);
          setChannelReady(true);
        }
      });

    return () => {
      setChannelReady(false);
      setBroadcastChannel(null);
      supabase.removeChannel(channel);
    };
  }, [duelId, currentUserId]);

  // Broadcast state changes
  const broadcastState = useCallback(() => {
    if (!broadcastChannel || !channelReady || !currentUserId) return;

    const serializeCard = (c: MagicCard) => ({
      id: typeof c.id === 'string' ? c.id : c.id,
      name: c.name,
      image: getMagicCardImage(c),
      isFaceDown: c.isFaceDown || false,
      isTapped: c.isTapped || false,
      counters: c.counters || 0,
      power: c.power || undefined,
      toughness: c.toughness || undefined,
      oracle_text: c.oracle_text || undefined,
      type_line: c.type_line || undefined,
      mana_cost: c.mana_cost || undefined,
    });

    broadcastChannel.send({
      type: 'broadcast',
      event: 'deck-state',
      payload: {
        userId: currentUserId,
        tcgType: 'magic',
        hand: fieldState.hand.length,
        deckCount: fieldState.library.length,
        extraCount: 0,
        phase: currentPhase,
        battlefield: fieldState.battlefield.map(serializeCard),
        lands: fieldState.lands.map(serializeCard),
        graveyard: fieldState.graveyard.map(serializeCard),
        exile: fieldState.exile.map(serializeCard),
        stack: fieldState.stack.map(serializeCard),
        commandZone: fieldState.commandZone?.map(serializeCard) || [],
        playmatUrl: localStorage.getItem('activePlaymatUrl') || null,
        sleeveUrl: localStorage.getItem('activeSleeveUrl') || null,
      },
    });
  }, [fieldState, currentPhase, broadcastChannel, channelReady, currentUserId]);

  useEffect(() => {
    broadcastStateRef.current = broadcastState;
  }, [broadcastState]);

  useEffect(() => {
    broadcastState();
  }, [broadcastState]);

  const ZONE_LABELS: Record<string, string> = {
    hand: 'Mão',
    battlefield: 'Campo',
    lands: 'Terrenos',
    graveyard: 'Cemitério',
    exile: 'Exílio',
    stack: 'Pilha',
    library: 'Grimório',
    commandZone: 'Zona de Comando',
  };

  const moveTargets: MagicZoneType[] = ['hand', 'battlefield', 'lands', 'graveyard', 'exile', 'stack', 'library'];
  const viewingCards = useMemo(() => ([...(fieldState[viewingZone] as MagicCard[])]).reverse(), [fieldState, viewingZone]);

  const activePlaymatUrl = typeof window !== 'undefined' ? localStorage.getItem('activePlaymatUrl') : null;
  const activeSleeveUrl = typeof window !== 'undefined' ? localStorage.getItem('activeSleeveUrl') : null;

  if (embedded) {
    return (
      <>
        <div className="absolute inset-0 z-10 bg-card flex flex-col">
          <div className="flex items-center justify-between p-2 border-b border-border flex-shrink-0 flex-wrap gap-1">
            <span className="text-sm font-semibold">Arena MTG</span>
            <div className="flex gap-1 flex-wrap">
              <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={drawInitialHand}>
                <Hand className="w-3 h-3" /> Mão (7)
              </Button>
              <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={mulligan}>
                <Undo2 className="w-3 h-3" /> Mulligan
              </Button>
              <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={drawCard}>
                <ArrowDown className="w-3 h-3" /> Comprar
              </Button>
              <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={millCard}>Mill</Button>
              <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={scryTop}>
                <Eye className="w-3 h-3" /> Scry
              </Button>
              <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={shuffleLibrary}>
                <Shuffle className="w-3 h-3" /> Embaralhar
              </Button>
              <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={untapAll}>
                <RotateCcw className="w-3 h-3" /> Untap All
              </Button>
              <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => setSearchOpen(true)}>
                <Search className="w-3 h-3" /> Buscar
              </Button>
              <Button size="sm" variant="destructive" className="text-xs h-7 gap-1" onClick={onClose}>
                Fechar
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <MagicFieldBoard
              fieldState={fieldState}
              currentPhase={currentPhase}
              onPhaseChange={setCurrentPhase}
              onZoneClick={handleZoneClick}
              onCardClick={handleCardClick}
              onCardDrop={handleCardDrop}
              onTapCard={handleTapCard}
              playmatUrl={activePlaymatUrl}
              sleeveUrl={activeSleeveUrl}
            />
          </div>
        </div>

        <MtgCardDetailDialog
          open={cardDetailOpen}
          onOpenChange={setCardDetailOpen}
          card={selectedCard}
          cardZone={selectedCardZone}
          moveTargets={moveTargets}
          zoneLabels={ZONE_LABELS}
          onMoveCardTo={moveCardTo}
          onToggleFaceDown={toggleFaceDown}
          onTapCard={(c) => { handleTapCard(c); setCardDetailOpen(false); }}
          onModifyCounters={(c, d) => { modifyCounters(c, d); setCardDetailOpen(false); }}
        />

        <Dialog open={zoneViewerOpen} onOpenChange={setZoneViewerOpen}>
          <DialogContent className="max-w-md max-h-[70vh]">
            <DialogHeader>
              <DialogTitle className="text-sm flex items-center gap-2">
                {ZONE_LABELS[viewingZone]}
                <Badge variant="secondary">{fieldState[viewingZone]?.length || 0}</Badge>
              </DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[50vh]">
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 p-1">
                {viewingCards.length === 0 && (
                  <p className="col-span-full text-center text-sm text-muted-foreground py-8">Zona vazia</p>
                )}
                {viewingCards.map((card) => (
                  <div key={card.instanceId} className="cursor-pointer hover:ring-2 ring-primary rounded overflow-hidden transition-all"
                    onClick={() => { setSelectedCard(card); setSelectedCardZone(viewingZone); setZoneViewerOpen(false); setCardDetailOpen(true); }}>
                    <img src={getMagicCardImage(card, 'small')} alt={card.name} className="w-full aspect-[63/88] object-cover" loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).src = MTG_CARD_BACK; }} />
                    <p className="text-[9px] text-center truncate px-0.5 py-0.5 bg-card">{card.name}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>

        <Dialog open={searchOpen} onOpenChange={(open) => { setSearchOpen(open); if (!open) setSearchQuery(''); }}>
          <DialogContent className="max-w-md max-h-[80vh]">
            <DialogHeader>
              <DialogTitle className="text-sm flex items-center gap-2">
                <Search className="w-4 h-4" /> Buscar no Grimório
                <Badge variant="secondary">{fieldState.library.length}</Badge>
              </DialogTitle>
            </DialogHeader>
            <Input placeholder="Buscar por nome ou tipo..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="h-9 text-sm" autoFocus />
            <ScrollArea className="max-h-[50vh]">
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 p-1">
                {searchResults.length === 0 && (
                  <p className="col-span-full text-center text-sm text-muted-foreground py-8">Nenhuma carta encontrada</p>
                )}
                {searchResults.map((card) => (
                  <div key={card.instanceId} className="cursor-pointer hover:ring-2 ring-primary rounded overflow-hidden transition-all"
                    onClick={() => searchAndPickCard(card)} title={`Adicionar "${card.name}" à mão`}>
                    <img src={getMagicCardImage(card, 'small')} alt={card.name} className="w-full aspect-[63/88] object-cover" loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).src = MTG_CARD_BACK; }} />
                    <p className="text-[9px] text-center truncate px-0.5 py-0.5 bg-card">{card.name}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent side="bottom" className="h-[85vh] sm:h-[80vh] p-2 sm:p-4 z-[60]">
          <SheetHeader className="pb-2">
            <SheetTitle className="flex items-center justify-between text-sm flex-wrap gap-1">
              <span>Arena MTG</span>
              <div className="flex gap-1 flex-wrap">
                <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={drawInitialHand}>
                  <Hand className="w-3 h-3" /> Mão (7)
                </Button>
                <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={mulligan}>
                  <Undo2 className="w-3 h-3" /> Mulligan
                </Button>
                <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={drawCard}>
                  <ArrowDown className="w-3 h-3" /> Comprar
                </Button>
                <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={millCard}>
                  Mill
                </Button>
                <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={scryTop}>
                  <Eye className="w-3 h-3" /> Scry
                </Button>
                <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={shuffleLibrary}>
                  <Shuffle className="w-3 h-3" /> Embaralhar
                </Button>
                <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={untapAll}>
                  <RotateCcw className="w-3 h-3" /> Untap All
                </Button>
                <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={() => setSearchOpen(true)}>
                  <Search className="w-3 h-3" /> Buscar
                </Button>
              </div>
            </SheetTitle>
          </SheetHeader>

          <div className="h-[calc(100%-48px)] overflow-hidden">
            <MagicFieldBoard
              fieldState={fieldState}
              currentPhase={currentPhase}
              onPhaseChange={setCurrentPhase}
              onZoneClick={handleZoneClick}
              onCardClick={handleCardClick}
              onCardDrop={handleCardDrop}
              onTapCard={handleTapCard}
              playmatUrl={activePlaymatUrl}
              sleeveUrl={activeSleeveUrl}
            />
          </div>
        </SheetContent>
      </Sheet>

      <MtgCardDetailDialog
        open={cardDetailOpen}
        onOpenChange={setCardDetailOpen}
        card={selectedCard}
        cardZone={selectedCardZone}
        moveTargets={moveTargets}
        zoneLabels={ZONE_LABELS}
        onMoveCardTo={moveCardTo}
        onToggleFaceDown={toggleFaceDown}
        onTapCard={(c) => { handleTapCard(c); setCardDetailOpen(false); }}
        onModifyCounters={(c, d) => { modifyCounters(c, d); setCardDetailOpen(false); }}
      />

      <Dialog open={zoneViewerOpen} onOpenChange={setZoneViewerOpen}>
        <DialogContent className="max-w-md max-h-[70vh]">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              {ZONE_LABELS[viewingZone]}
              <Badge variant="secondary">{fieldState[viewingZone]?.length || 0}</Badge>
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[50vh]">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 p-1">
              {viewingCards.length === 0 && (
                <p className="col-span-full text-center text-sm text-muted-foreground py-8">
                  Zona vazia
                </p>
              )}
              {viewingCards.map((card) => (
                <div
                  key={card.instanceId}
                  className="cursor-pointer hover:ring-2 ring-primary rounded overflow-hidden transition-all"
                  onClick={() => {
                    setSelectedCard(card);
                    setSelectedCardZone(viewingZone);
                    setZoneViewerOpen(false);
                    setCardDetailOpen(true);
                  }}
                >
                  <img
                    src={getMagicCardImage(card, 'small')}
                    alt={card.name}
                    className="w-full aspect-[63/88] object-cover"
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).src = MTG_CARD_BACK; }}
                  />
                  <p className="text-[9px] text-center truncate px-0.5 py-0.5 bg-card">{card.name}</p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Search Library Dialog */}
      <Dialog open={searchOpen} onOpenChange={(open) => { setSearchOpen(open); if (!open) setSearchQuery(''); }}>
        <DialogContent className="max-w-md max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <Search className="w-4 h-4" />
              Buscar no Grimório
              <Badge variant="secondary">{fieldState.library.length}</Badge>
            </DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Buscar por nome ou tipo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 text-sm"
            autoFocus
          />
          <ScrollArea className="max-h-[50vh]">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 p-1">
              {searchResults.length === 0 && (
                <p className="col-span-full text-center text-sm text-muted-foreground py-8">
                  Nenhuma carta encontrada
                </p>
              )}
              {searchResults.map((card) => (
                <div
                  key={card.instanceId}
                  className="cursor-pointer hover:ring-2 ring-primary rounded overflow-hidden transition-all"
                  onClick={() => searchAndPickCard(card)}
                  title={`Adicionar "${card.name}" à mão`}
                >
                  <img
                    src={getMagicCardImage(card, 'small')}
                    alt={card.name}
                    className="w-full aspect-[63/88] object-cover"
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).src = MTG_CARD_BACK; }}
                  />
                  <p className="text-[9px] text-center truncate px-0.5 py-0.5 bg-card">{card.name}</p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
};