/**
 * DuelVerse - Pokémon Duel Viewer
 * 
 * Arena digital para Pokémon TCG com mecânicas:
 * - Buscar carta no deck
 * - Colocar/tirar energia
 * - Ativar treinadores/itens
 * - Devolver cartas ao deck
 * - Zonas: Active, Bench, Prize, Discard, Deck, Stadium
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Zap, RotateCcw, Eye, EyeOff, Shuffle, Star, Trash2, Search, ArrowUp, Minus, Plus, Undo2, BookOpen, ChevronDown } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useSavedDecks } from '@/hooks/useSavedDecks';
import { PkmCardActionModal } from './PkmCardActionModal';

interface PokemonFieldCard {
  id: string;
  instanceId: string;
  name: string;
  images: { small: string; large: string };
  supertype: string;
  subtypes?: string[];
  hp?: string;
  types?: string[];
  energyAttached: number;
  damageCounters: number;
  isFaceDown?: boolean;
  attacks?: { name: string; damage: string; text: string; cost: string[] }[];
  abilities?: { name: string; text: string; type: string }[];
  rules?: string[];
}

interface PokemonFieldState {
  active: PokemonFieldCard | null;
  bench: PokemonFieldCard[];
  prizeCards: PokemonFieldCard[];
  discard: PokemonFieldCard[];
  hand: PokemonFieldCard[];
  deck: PokemonFieldCard[];
  stadium: PokemonFieldCard | null;
  activeTrainer: PokemonFieldCard | null;
}

interface PokemonDuelViewerProps {
  duelId: string;
  currentUserId: string;
}

export const PokemonDuelViewer = ({ duelId, currentUserId }: PokemonDuelViewerProps) => {
  const { toast } = useToast();
  const { savedDecks, fetchDecks, isLoading: loadingDecks } = useSavedDecks('pokemon');

  const [fieldState, setFieldState] = useState<PokemonFieldState>({
    active: null,
    bench: [],
    prizeCards: [],
    discard: [],
    hand: [],
    deck: [],
    stadium: null,
    activeTrainer: null,
  });

  const [showDeckPicker, setShowDeckPicker] = useState(true);
  const [selectedCard, setSelectedCard] = useState<PokemonFieldCard | null>(null);
  const [selectedCardZone, setSelectedCardZone] = useState<'hand' | 'active' | 'bench' | 'discard' | 'deck' | null>(null);
  const [showHandModal, setShowHandModal] = useState(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [showPrizeModal, setShowPrizeModal] = useState(false);
  const [showDeckSearchModal, setShowDeckSearchModal] = useState(false);
  const [deckSearchQuery, setDeckSearchQuery] = useState('');
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
          active: fieldState.active ? { name: fieldState.active.name, images: fieldState.active.images, hp: fieldState.active.hp, types: fieldState.active.types, supertype: fieldState.active.supertype, energyAttached: fieldState.active.energyAttached, damageCounters: fieldState.active.damageCounters, attacks: fieldState.active.attacks, abilities: fieldState.active.abilities, rules: fieldState.active.rules } : null,
          bench: fieldState.bench.map(c => ({ name: c.name, images: c.images, hp: c.hp, types: c.types, supertype: c.supertype, energyAttached: c.energyAttached, damageCounters: c.damageCounters, attacks: c.attacks, abilities: c.abilities, rules: c.rules })),
          stadium: fieldState.stadium ? { name: fieldState.stadium.name, images: fieldState.stadium.images } : null,
          prizeCardsCount: fieldState.prizeCards.length,
          discardCount: fieldState.discard.length,
          discardCards: fieldState.discard.map(c => ({ name: c.name, image: c.images?.small || c.images?.large || '', id: parseInt(c.id) || 0 })),
          handCount: fieldState.hand.length,
          deckCount: fieldState.deck.length,
          playmatUrl: localStorage.getItem('activePlaymatUrl') || null,
          sleeveUrl: localStorage.getItem('activeSleeveUrl') || null,
        },
      });
    };
    channel.subscribe(() => broadcastState());
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
        subtypes: card.subtypes,
        hp: card.hp,
        types: card.types,
        energyAttached: 0,
        damageCounters: 0,
        isFaceDown: false,
        attacks: card.attacks || [],
        abilities: card.abilities || [],
        rules: card.rules || [],
      }));
    });

    // Shuffle
    for (let i = allCards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allCards[i], allCards[j]] = [allCards[j], allCards[i]];
    }

    const hand = allCards.slice(0, 7);
    const prize = allCards.slice(7, 13);
    const deck = allCards.slice(13);

    setFieldState({ active: null, bench: [], prizeCards: prize, discard: [], hand, deck, stadium: null, activeTrainer: null });
    setShowDeckPicker(false);
    setPhase('setup');
    toast({ title: `Deck "${savedDeck.name}" carregado!`, description: '7 cartas na mão, 6 prêmios' });
  };

  const drawCard = () => {
    if (fieldState.deck.length === 0) {
      toast({ title: 'Sem cartas!', description: 'Deck vazio', variant: 'destructive' });
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

  const returnToDeck = (card: PokemonFieldCard, from: 'hand' | 'active' | 'bench' | 'discard', position: 'top' | 'bottom' | 'shuffle') => {
    setFieldState(prev => {
      const newState = { ...prev };
      if (from === 'hand') newState.hand = prev.hand.filter(c => c.instanceId !== card.instanceId);
      else if (from === 'active') newState.active = null;
      else if (from === 'bench') newState.bench = prev.bench.filter(c => c.instanceId !== card.instanceId);
      else if (from === 'discard') newState.discard = prev.discard.filter(c => c.instanceId !== card.instanceId);

      if (position === 'top') {
        newState.deck = [card, ...prev.deck];
      } else if (position === 'bottom') {
        newState.deck = [...prev.deck, card];
      } else {
        const newDeck = [...prev.deck, card];
        for (let i = newDeck.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
        }
        newState.deck = newDeck;
      }
      return newState;
    });
    toast({ title: 'Carta devolvida ao deck', description: position === 'top' ? 'No topo' : position === 'bottom' ? 'No fundo' : 'Embaralhado' });
  };

  const attachEnergy = (targetCard: PokemonFieldCard, zone: 'active' | 'bench') => {
    // Find energy cards in hand
    const energyInHand = fieldState.hand.filter(c => c.supertype === 'Energy');
    if (energyInHand.length === 0) {
      toast({ title: 'Sem energia', description: 'Nenhuma carta de energia na mão', variant: 'destructive' });
      return;
    }
    const energy = energyInHand[0];
    setFieldState(prev => {
      const newState = { ...prev };
      newState.hand = prev.hand.filter(c => c.instanceId !== energy.instanceId);
      if (zone === 'active' && prev.active) {
        newState.active = { ...prev.active, energyAttached: prev.active.energyAttached + 1 };
      } else if (zone === 'bench') {
        newState.bench = prev.bench.map(c =>
          c.instanceId === targetCard.instanceId ? { ...c, energyAttached: c.energyAttached + 1 } : c
        );
      }
      // Put the energy card reference into discard for tracking (or we can just count)
      newState.discard = [...prev.discard, energy];
      return newState;
    });
    toast({ title: `Energia anexada a ${targetCard.name}!` });
  };

  const detachEnergy = (targetCard: PokemonFieldCard, zone: 'active' | 'bench') => {
    if (targetCard.energyAttached <= 0) {
      toast({ title: 'Sem energia', description: 'Este Pokémon não tem energia anexada', variant: 'destructive' });
      return;
    }
    setFieldState(prev => {
      const newState = { ...prev };
      if (zone === 'active' && prev.active) {
        newState.active = { ...prev.active, energyAttached: prev.active.energyAttached - 1 };
      } else if (zone === 'bench') {
        newState.bench = prev.bench.map(c =>
          c.instanceId === targetCard.instanceId ? { ...c, energyAttached: c.energyAttached - 1 } : c
        );
      }
      return newState;
    });
    toast({ title: `Energia removida de ${targetCard.name}` });
  };

  const activateTrainer = (card: PokemonFieldCard) => {
    const isStadium = card.subtypes?.includes('Stadium');
    setFieldState(prev => {
      const newState = { ...prev };
      newState.hand = prev.hand.filter(c => c.instanceId !== card.instanceId);
      if (isStadium) {
        // Replace existing stadium
        if (prev.stadium) {
          newState.discard = [...prev.discard, prev.stadium];
        }
        newState.stadium = card;
      } else {
        // Items/Supporters go to discard after use
        newState.discard = [...prev.discard, card];
      }
      return newState;
    });
    toast({ title: isStadium ? `Stadium "${card.name}" ativado!` : `"${card.name}" ativado!` });
  };

  const searchDeck = (card: PokemonFieldCard) => {
    setFieldState(prev => ({
      ...prev,
      deck: prev.deck.filter(c => c.instanceId !== card.instanceId),
      hand: [...prev.hand, card],
    }));
    toast({ title: `${card.name} adicionado à mão!` });
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

  const addDamage = (card: PokemonFieldCard, zone: 'active' | 'bench', amount: number) => {
    setFieldState(prev => {
      if (zone === 'active' && prev.active) {
        return { ...prev, active: { ...prev.active, damageCounters: Math.max(0, prev.active.damageCounters + amount) } };
      } else if (zone === 'bench') {
        return { ...prev, bench: prev.bench.map(c => c.instanceId === card.instanceId ? { ...c, damageCounters: Math.max(0, c.damageCounters + amount) } : c) };
      }
      return prev;
    });
  };

  const recoverFromDiscard = (card: PokemonFieldCard) => {
    setFieldState(prev => ({
      ...prev,
      discard: prev.discard.filter(c => c.instanceId !== card.instanceId),
      hand: [...prev.hand, card],
    }));
    toast({ title: `${card.name} recuperado do descarte!` });
  };

  const filteredDeckCards = deckSearchQuery.trim()
    ? fieldState.deck.filter(c => c.name.toLowerCase().includes(deckSearchQuery.toLowerCase()))
    : fieldState.deck;

  // ---- Card action modal for selected card ----
  const openCardActions = (card: PokemonFieldCard, zone: 'hand' | 'active' | 'bench' | 'discard' | 'deck') => {
    setSelectedCard(card);
    setSelectedCardZone(zone);
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

  const activePlaymatUrl = typeof window !== 'undefined' ? localStorage.getItem('activePlaymatUrl') : null;
  const activeSleeveUrl = typeof window !== 'undefined' ? localStorage.getItem('activeSleeveUrl') : null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border">
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

      {/* Field Layout with playmat */}
      <div
        className="p-3 space-y-2 relative overflow-hidden"
        style={{
          backgroundImage: activePlaymatUrl ? `url("${activePlaymatUrl}")` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundColor: activePlaymatUrl ? undefined : 'hsl(var(--background) / 0.95)',
        }}
      >
        {activePlaymatUrl && (
          <div className="absolute inset-0 bg-black/40 pointer-events-none z-0" />
        )}
        <div className="relative z-10">
        {/* Top row: Prize | Active | Deck + Stadium */}
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
                className="w-20 h-28 rounded-lg overflow-hidden border-2 border-primary shadow-lg cursor-pointer relative"
                onClick={() => openCardActions(fieldState.active!, 'active')}
              >
                <img src={fieldState.active.images.small} alt={fieldState.active.name} className="w-full h-full object-cover" />
                {fieldState.active.hp && !fieldState.active.isFaceDown && (
                  <div className="absolute top-0 left-0 z-20">
                    <div className="bg-background/90 border border-border text-[7px] font-bold px-1 py-0.5 rounded-br flex items-center gap-0.5 whitespace-nowrap">
                      <span className="text-primary">HP {fieldState.active.hp}</span>
                    </div>
                  </div>
                )}
                {fieldState.active.damageCounters > 0 && (
                  <Badge className="absolute -top-1 -right-1 text-[9px] bg-destructive">{fieldState.active.damageCounters * 10}</Badge>
                )}
                {fieldState.active.energyAttached > 0 && (
                  <Badge className="absolute -bottom-1 -right-1 text-[9px] bg-primary">{fieldState.active.energyAttached}⚡</Badge>
                )}
              </div>
            ) : (
              <div className="w-20 h-28 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                <span className="text-[10px] text-muted-foreground text-center">Ativo</span>
              </div>
            )}
          </div>

          {/* Stadium */}
          {fieldState.stadium && (
            <div className="relative">
              <div
                className="w-14 h-20 rounded overflow-hidden border-2 border-accent cursor-pointer"
                onClick={() => {
                  setFieldState(prev => ({
                    ...prev,
                    discard: [...prev.discard, prev.stadium!],
                    stadium: null,
                  }));
                  toast({ title: 'Stadium removido' });
                }}
              >
                <img src={fieldState.stadium.images.small} alt={fieldState.stadium.name} className="w-full h-full object-cover" />
              </div>
              <span className="text-[8px] text-muted-foreground block text-center">Stadium</span>
            </div>
          )}

          {/* Deck */}
          <div className="flex flex-col items-center gap-1">
            <div
              className="w-14 h-20 rounded border-2 border-accent/30 overflow-hidden cursor-pointer hover:opacity-90 transition-opacity relative"
              onClick={drawCard}
            >
              <img
                src={activeSleeveUrl || 'https://images.pokemontcg.io/back.png'}
                alt="Deck"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
                <span className="text-sm font-bold text-white">{fieldState.deck.length}</span>
              </div>
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
              className="relative w-12 h-16 rounded overflow-hidden border border-border cursor-pointer hover:border-primary transition-colors"
              onClick={() => openCardActions(card, 'bench')}
            >
              <img src={card.images.small} alt={card.name} className="w-full h-full object-cover" />
              {card.hp && !card.isFaceDown && (
                <div className="absolute top-0 left-0 z-20">
                  <div className="bg-background/90 border border-border text-[6px] font-bold px-0.5 rounded-br whitespace-nowrap">
                    <span className="text-primary">HP {card.hp}</span>
                  </div>
                </div>
              )}
              {card.energyAttached > 0 && (
                <Badge className="absolute -bottom-0.5 -right-0.5 text-[8px] px-1 bg-primary">{card.energyAttached}⚡</Badge>
              )}
              {card.damageCounters > 0 && (
                <Badge className="absolute -top-0.5 -right-0.5 text-[8px] px-1 bg-destructive">{card.damageCounters * 10}</Badge>
              )}
            </div>
          ))}
          {Array.from({ length: Math.max(0, 5 - fieldState.bench.length) }).map((_, i) => (
            <div key={i} className="w-12 h-16 rounded border border-dashed border-border/30" />
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-1.5 justify-center flex-wrap">
          <Button size="sm" variant="outline" onClick={drawCard} className="text-xs h-7">
            Comprar
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowHandModal(true)} className="text-xs h-7">
            Mão ({fieldState.hand.length})
          </Button>
          <Button size="sm" variant="outline" onClick={collectPrize} className="text-xs h-7">
            Prêmio
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setDeckSearchQuery(''); setShowDeckSearchModal(true); }} className="text-xs h-7">
            <Search className="w-3 h-3 mr-1" />
            Buscar Deck
          </Button>
          <Button size="sm" variant="outline" onClick={shuffleDeck} className="text-xs h-7">
            <Shuffle className="w-3 h-3 mr-1" />
            Embaralhar
          </Button>
        </div>
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
                  <img src={card.images.small} alt={card.name} className="w-full rounded cursor-pointer hover:ring-2 ring-primary" onClick={() => { setShowHandModal(false); openCardActions(card, 'hand'); }} />
                  <p className="text-[10px] font-medium truncate text-center">{card.name}</p>
                  <div className="flex gap-0.5 flex-wrap">
                    {card.supertype === 'Pokémon' && (
                      <>
                        <Button size="sm" variant="outline" className="flex-1 text-[9px] h-6 px-1" onClick={() => { playToActive(card); setShowHandModal(false); }}>
                          Ativo
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 text-[9px] h-6 px-1" onClick={() => playToBench(card)}>
                          Banco
                        </Button>
                      </>
                    )}
                    {card.supertype === 'Trainer' && (
                      <Button size="sm" variant="default" className="flex-1 text-[9px] h-6 px-1" onClick={() => { activateTrainer(card); setShowHandModal(false); }}>
                        Ativar
                      </Button>
                    )}
                    {card.supertype === 'Energy' && fieldState.active && (
                      <Button size="sm" variant="default" className="flex-1 text-[9px] h-6 px-1" onClick={() => {
                        setFieldState(prev => ({
                          ...prev,
                          hand: prev.hand.filter(c => c.instanceId !== card.instanceId),
                          active: prev.active ? { ...prev.active, energyAttached: prev.active.energyAttached + 1 } : null,
                        }));
                        toast({ title: `Energia em ${fieldState.active!.name}` });
                      }}>
                        ⚡ Ativo
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-[9px] h-6 px-1" onClick={() => discardCard(card, 'hand')}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-[9px] h-6 px-1" onClick={() => { returnToDeck(card, 'hand', 'shuffle'); setShowHandModal(false); }}>
                      <Undo2 className="w-3 h-3" />
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
                <div key={card.instanceId} className="space-y-1">
                  <img src={card.images.small} alt={card.name} className="w-full rounded" />
                  <div className="flex gap-0.5">
                    <Button size="sm" variant="outline" className="flex-1 text-[9px] h-6 px-1" onClick={() => { recoverFromDiscard(card); }}>
                      Mão
                    </Button>
                    <Button size="sm" variant="ghost" className="text-[9px] h-6 px-1" onClick={() => { returnToDeck(card, 'discard', 'bottom'); }}>
                      <Undo2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
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

      {/* Deck Search Modal */}
      <Dialog open={showDeckSearchModal} onOpenChange={setShowDeckSearchModal}>
        <DialogContent className="max-w-lg max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Search className="w-4 h-4" />
              Buscar no Deck ({fieldState.deck.length} cartas)
            </DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar carta no deck..."
              value={deckSearchQuery}
              onChange={e => setDeckSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <ScrollArea className="max-h-[50vh]">
            <div className="grid grid-cols-3 gap-2 p-2">
              {filteredDeckCards.map(card => (
                <div key={card.instanceId} className="space-y-1">
                  <img src={card.images.small} alt={card.name} className="w-full rounded cursor-pointer hover:ring-2 ring-primary" />
                  <p className="text-[10px] font-medium truncate text-center">{card.name}</p>
                  <Button size="sm" variant="outline" className="w-full text-[9px] h-6" onClick={() => { searchDeck(card); setShowDeckSearchModal(false); }}>
                    Pegar
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
          <Button variant="outline" onClick={() => { shuffleDeck(); setShowDeckSearchModal(false); }}>
            <Shuffle className="w-3 h-3 mr-1" />
            Embaralhar e fechar
          </Button>
        </DialogContent>
      </Dialog>

      {/* Card Action Modal */}
      {selectedCard && selectedCardZone && (
        <PkmCardActionModal
          card={selectedCard}
          zone={selectedCardZone}
          fieldState={fieldState}
          onClose={() => { setSelectedCard(null); setSelectedCardZone(null); }}
          onAttachEnergy={attachEnergy}
          onDetachEnergy={detachEnergy}
          onAddDamage={addDamage}
          onDiscard={discardCard}
          onReturnToDeck={returnToDeck}
          onPlayToActive={playToActive}
          onPlayToBench={playToBench}
          onActivateTrainer={activateTrainer}
          onPromoteToActive={(card) => {
            setFieldState(prev => {
              const newBench = prev.bench.filter(c => c.instanceId !== card.instanceId);
              const oldActive = prev.active;
              return { ...prev, active: card, bench: oldActive ? [...newBench, oldActive] : newBench };
            });
          }}
        />
      )}
    </div>
  );
};
