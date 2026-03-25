/**
 * DuelVerse - Pokémon Duel Viewer
 * 
 * Arena digital para Pokémon TCG com zonas:
 * Active, Bench, Prize Cards, Discard, Deck.
 * Broadcast de estado para sincronização em tempo real.
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Zap, RotateCcw, Eye, EyeOff, Shuffle, Star, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useSavedDecks } from '@/hooks/useSavedDecks';

interface PokemonFieldCard {
  id: string;
  instanceId: string;
  name: string;
  images: { small: string; large: string };
  supertype: string;
  hp?: string;
  types?: string[];
  energyAttached?: number;
  damageCounters?: number;
  isFaceDown?: boolean;
}

interface PokemonFieldState {
  active: PokemonFieldCard | null;
  bench: PokemonFieldCard[];
  prizeCards: PokemonFieldCard[];
  discard: PokemonFieldCard[];
  hand: PokemonFieldCard[];
  deck: PokemonFieldCard[];
}

interface PokemonDuelViewerProps {
  duelId: string;
  currentUserId: string;
}

export const PokemonDuelViewer = ({ duelId, currentUserId }: PokemonDuelViewerProps) => {
  const { toast } = useToast();
  const { decks: savedDecks, fetchDecks, isLoading: loadingDecks } = useSavedDecks('pokemon');

  const [fieldState, setFieldState] = useState<PokemonFieldState>({
    active: null,
    bench: [],
    prizeCards: [],
    discard: [],
    hand: [],
    deck: [],
  });

  const [showDeckPicker, setShowDeckPicker] = useState(true);
  const [selectedCard, setSelectedCard] = useState<PokemonFieldCard | null>(null);
  const [showHandModal, setShowHandModal] = useState(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [showPrizeModal, setShowPrizeModal] = useState(false);
  const [phase, setPhase] = useState<'setup' | 'draw' | 'main' | 'attack' | 'end'>('setup');

  useEffect(() => {
    fetchDecks();
  }, []);

  // Broadcast state
  useEffect(() => {
    const channel = supabase.channel(`deck-sync-${duelId}`);
    const broadcastState = () => {
      channel.send({
        type: 'broadcast',
        event: 'deck-state',
        payload: {
          userId: currentUserId,
          tcgType: 'pokemon',
          active: fieldState.active ? { name: fieldState.active.name, images: fieldState.active.images, hp: fieldState.active.hp, types: fieldState.active.types, energyAttached: fieldState.active.energyAttached, damageCounters: fieldState.active.damageCounters } : null,
          bench: fieldState.bench.map(c => ({ name: c.name, images: c.images, hp: c.hp, types: c.types, energyAttached: c.energyAttached, damageCounters: c.damageCounters })),
          prizeCardsCount: fieldState.prizeCards.length,
          discardCount: fieldState.discard.length,
          handCount: fieldState.hand.length,
          deckCount: fieldState.deck.length,
        },
      });
    };

    channel.subscribe(() => {
      broadcastState();
    });

    return () => { supabase.removeChannel(channel); };
  }, [fieldState, duelId, currentUserId]);

  const loadDeckToField = (savedDeck: any) => {
    const allCards: PokemonFieldCard[] = (savedDeck.main_deck as any[]).flatMap((card: any) => {
      const qty = card.quantity || 1;
      return Array.from({ length: qty }, (_, i) => ({
        id: card.id,
        instanceId: `${card.id}-${i}-${Date.now()}`,
        name: card.name,
        images: card.images,
        supertype: card.supertype,
        hp: card.hp,
        types: card.types,
        energyAttached: 0,
        damageCounters: 0,
        isFaceDown: false,
      }));
    });

    // Shuffle
    for (let i = allCards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allCards[i], allCards[j]] = [allCards[j], allCards[i]];
    }

    // Setup: 7 hand, 6 prize, rest deck
    const hand = allCards.slice(0, 7);
    const prize = allCards.slice(7, 13);
    const deck = allCards.slice(13);

    setFieldState({ active: null, bench: [], prizeCards: prize, discard: [], hand, deck });
    setShowDeckPicker(false);
    setPhase('setup');
    toast({ title: `Deck "${savedDeck.name}" carregado!`, description: '7 cartas na mão, 6 prêmios definidos' });
  };

  const drawCard = () => {
    if (fieldState.deck.length === 0) {
      toast({ title: 'Sem cartas!', description: 'Deck vazio — você perde!', variant: 'destructive' });
      return;
    }
    const [drawn, ...rest] = fieldState.deck;
    setFieldState(prev => ({ ...prev, hand: [...prev.hand, drawn], deck: rest }));
    setPhase('main');
  };

  const playToActive = (card: PokemonFieldCard) => {
    setFieldState(prev => ({
      ...prev,
      hand: prev.hand.filter(c => c.instanceId !== card.instanceId),
      active: card,
    }));
  };

  const playToBench = (card: PokemonFieldCard) => {
    if (fieldState.bench.length >= 5) {
      toast({ title: 'Banco cheio', description: 'Máximo 5 Pokémon no banco', variant: 'destructive' });
      return;
    }
    setFieldState(prev => ({
      ...prev,
      hand: prev.hand.filter(c => c.instanceId !== card.instanceId),
      bench: [...prev.bench, card],
    }));
  };

  const discardCard = (card: PokemonFieldCard, from: 'hand' | 'active' | 'bench') => {
    setFieldState(prev => {
      const newState = { ...prev };
      if (from === 'hand') newState.hand = prev.hand.filter(c => c.instanceId !== card.instanceId);
      else if (from === 'active') newState.active = null;
      else if (from === 'bench') newState.bench = prev.bench.filter(c => c.instanceId !== card.instanceId);
      newState.discard = [...prev.discard, card];
      return newState;
    });
  };

  const collectPrize = () => {
    if (fieldState.prizeCards.length === 0) return;
    const [prize, ...rest] = fieldState.prizeCards;
    setFieldState(prev => ({ ...prev, prizeCards: rest, hand: [...prev.hand, prize] }));
    toast({ title: 'Prize Card coletada!' });
  };

  const shuffleDeck = () => {
    setFieldState(prev => {
      const shuffled = [...prev.deck];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return { ...prev, deck: shuffled };
    });
    toast({ title: 'Deck embaralhado!' });
  };

  if (showDeckPicker) {
    return (
      <div className="fixed inset-0 z-50 bg-background/95 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg card-mystic">
          <CardContent className="p-6 space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              Selecione seu Deck PKM
            </h2>
            {loadingDecks ? (
              <p className="text-muted-foreground">Carregando...</p>
            ) : savedDecks.length === 0 ? (
              <p className="text-muted-foreground">Nenhum deck PKM salvo. Crie um no Deck Builder!</p>
            ) : (
              <ScrollArea className="max-h-[300px]">
                <div className="space-y-2">
                  {savedDecks.map(d => {
                    const count = (d.main_deck as any[])?.reduce((s: number, c: any) => s + (c.quantity || 1), 0) || 0;
                    return (
                      <div
                        key={d.id}
                        className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                        onClick={() => loadDeckToField(d)}
                      >
                        <div>
                          <p className="font-medium">{d.name}</p>
                          <p className="text-xs text-muted-foreground">{count} cartas</p>
                        </div>
                        <Button size="sm">Usar</Button>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
            <Button variant="outline" className="w-full" onClick={() => setShowDeckPicker(false)}>
              Jogar sem deck
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 border-t border-border">
      {/* Phase Indicator */}
      <div className="flex items-center justify-center gap-2 py-1.5 border-b border-border/50 bg-muted/30">
        {(['draw', 'main', 'attack', 'end'] as const).map(p => (
          <Badge
            key={p}
            variant={phase === p ? 'default' : 'outline'}
            className={`cursor-pointer text-[10px] ${phase === p ? '' : 'opacity-60'}`}
            onClick={() => setPhase(p)}
          >
            {p === 'draw' ? 'Compra' : p === 'main' ? 'Principal' : p === 'attack' ? 'Ataque' : 'Fim'}
          </Badge>
        ))}
      </div>

      {/* Field Layout */}
      <div className="p-3 space-y-2">
        {/* Top row: Prize | Active | Deck + Actions */}
        <div className="flex items-center gap-3 justify-center">
          {/* Prize Cards */}
          <div
            className="w-14 h-20 rounded border-2 border-dashed border-primary/30 flex flex-col items-center justify-center cursor-pointer hover:bg-primary/10 transition-colors"
            onClick={() => setShowPrizeModal(true)}
          >
            <Star className="w-4 h-4 text-primary" />
            <span className="text-[10px] font-bold">{fieldState.prizeCards.length}</span>
            <span className="text-[8px] text-muted-foreground">Prêmio</span>
          </div>

          {/* Active Pokémon */}
          <div className="relative">
            {fieldState.active ? (
              <div
                className="w-20 h-28 rounded-lg overflow-hidden border-2 border-primary shadow-lg cursor-pointer"
                onClick={() => setSelectedCard(fieldState.active)}
              >
                <img src={fieldState.active.images.small} alt={fieldState.active.name} className="w-full h-full object-cover" />
                {(fieldState.active.damageCounters || 0) > 0 && (
                  <Badge className="absolute -top-1 -right-1 text-[9px] bg-destructive">{fieldState.active.damageCounters}</Badge>
                )}
                {(fieldState.active.energyAttached || 0) > 0 && (
                  <Badge className="absolute -bottom-1 -right-1 text-[9px] bg-primary">{fieldState.active.energyAttached}⚡</Badge>
                )}
              </div>
            ) : (
              <div className="w-20 h-28 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                <span className="text-[10px] text-muted-foreground text-center">Ativo</span>
              </div>
            )}
          </div>

          {/* Deck */}
          <div className="flex flex-col items-center gap-1">
            <div
              className="w-14 h-20 rounded border-2 border-accent/30 bg-accent/5 flex flex-col items-center justify-center cursor-pointer hover:bg-accent/10 transition-colors"
              onClick={drawCard}
            >
              <span className="text-sm font-bold">{fieldState.deck.length}</span>
              <span className="text-[8px] text-muted-foreground">Deck</span>
            </div>
          </div>

          {/* Discard */}
          <div
            className="w-14 h-20 rounded border-2 border-dashed border-destructive/30 flex flex-col items-center justify-center cursor-pointer hover:bg-destructive/10 transition-colors"
            onClick={() => setShowDiscardModal(true)}
          >
            <Trash2 className="w-4 h-4 text-destructive/60" />
            <span className="text-[10px] font-bold">{fieldState.discard.length}</span>
            <span className="text-[8px] text-muted-foreground">Descarte</span>
          </div>
        </div>

        {/* Bench */}
        <div className="flex items-center gap-1.5 justify-center">
          <span className="text-[10px] text-muted-foreground mr-1">Banco:</span>
          {fieldState.bench.map(card => (
            <div
              key={card.instanceId}
              className="w-12 h-16 rounded overflow-hidden border border-border cursor-pointer hover:border-primary transition-colors"
              onClick={() => setSelectedCard(card)}
            >
              <img src={card.images.small} alt={card.name} className="w-full h-full object-cover" />
            </div>
          ))}
          {Array.from({ length: Math.max(0, 5 - fieldState.bench.length) }).map((_, i) => (
            <div key={i} className="w-12 h-16 rounded border border-dashed border-border/30" />
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-center flex-wrap">
          <Button size="sm" variant="outline" onClick={drawCard}>
            Comprar
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowHandModal(true)}>
            Mão ({fieldState.hand.length})
          </Button>
          <Button size="sm" variant="outline" onClick={collectPrize}>
            Prêmio
          </Button>
          <Button size="sm" variant="outline" onClick={shuffleDeck}>
            <Shuffle className="w-3 h-3 mr-1" />
            Embaralhar
          </Button>
        </div>
      </div>

      {/* Hand Modal */}
      <Dialog open={showHandModal} onOpenChange={setShowHandModal}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Sua Mão ({fieldState.hand.length} cartas)</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 p-2">
              {fieldState.hand.map(card => (
                <div key={card.instanceId} className="space-y-1">
                  <img src={card.images.small} alt={card.name} className="w-full rounded cursor-pointer hover:ring-2 ring-primary" />
                  <div className="flex gap-0.5">
                    {card.supertype === 'Pokémon' && (
                      <>
                        <Button size="sm" variant="outline" className="flex-1 text-[10px] h-6" onClick={() => { playToActive(card); setShowHandModal(false); }}>
                          Ativo
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 text-[10px] h-6" onClick={() => playToBench(card)}>
                          Banco
                        </Button>
                      </>
                    )}
                    <Button size="sm" variant="ghost" className="text-[10px] h-6" onClick={() => discardCard(card, 'hand')}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Discard Modal */}
      <Dialog open={showDiscardModal} onOpenChange={setShowDiscardModal}>
        <DialogContent className="max-w-lg max-h-[70vh]">
          <DialogHeader>
            <DialogTitle>Pilha de Descarte ({fieldState.discard.length})</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[50vh]">
            <div className="grid grid-cols-3 gap-2 p-2">
              {fieldState.discard.map(card => (
                <img key={card.instanceId} src={card.images.small} alt={card.name} className="w-full rounded" />
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Prize Modal */}
      <Dialog open={showPrizeModal} onOpenChange={setShowPrizeModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Prize Cards ({fieldState.prizeCards.length})</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2 p-2">
            {fieldState.prizeCards.map((_, i) => (
              <div key={i} className="w-full aspect-[2.5/3.5] rounded bg-primary/20 border-2 border-primary/30 flex items-center justify-center">
                <EyeOff className="w-6 h-6 text-primary/40" />
              </div>
            ))}
          </div>
          <Button onClick={() => { collectPrize(); setShowPrizeModal(false); }} disabled={fieldState.prizeCards.length === 0}>
            Coletar Prize Card
          </Button>
        </DialogContent>
      </Dialog>

      {/* Card Detail */}
      {selectedCard && (
        <Dialog open={!!selectedCard} onOpenChange={() => setSelectedCard(null)}>
          <DialogContent className="max-w-sm">
            <img src={selectedCard.images.large || selectedCard.images.small} alt={selectedCard.name} className="w-full rounded-lg" />
            <div className="flex gap-2 flex-wrap">
              {selectedCard === fieldState.active && (
                <Button size="sm" variant="destructive" onClick={() => { discardCard(selectedCard, 'active'); setSelectedCard(null); }}>
                  Descartar
                </Button>
              )}
              {fieldState.bench.includes(selectedCard) && (
                <>
                  <Button size="sm" onClick={() => {
                    setFieldState(prev => {
                      const newBench = prev.bench.filter(c => c.instanceId !== selectedCard.instanceId);
                      const oldActive = prev.active;
                      return { ...prev, active: selectedCard, bench: oldActive ? [...newBench, oldActive] : newBench };
                    });
                    setSelectedCard(null);
                  }}>
                    Promover a Ativo
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => { discardCard(selectedCard, 'bench'); setSelectedCard(null); }}>
                    Descartar
                  </Button>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};