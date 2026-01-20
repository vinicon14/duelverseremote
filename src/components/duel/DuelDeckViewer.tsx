import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { 
  Layers, 
  Hand, 
  Trash2, 
  RotateCcw,
  Shuffle,
  X,
  Eye,
  EyeOff,
  Upload,
  Minus,
  Plus,
  BookOpen,
  Maximize2,
  Minimize2,
  Search,
  ChevronDown,
  ChevronUp,
  Flame,
  Ban
} from 'lucide-react';
import { DeckCard } from '@/components/deckbuilder/DeckPanel';
import { YugiohCard } from '@/hooks/useYugiohCards';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface DuelDeckViewerProps {
  isOpen: boolean;
  onClose: () => void;
  deck: DeckCard[];
  extraDeck: DeckCard[];
  sideDeck: DeckCard[];
  onLoadDeck: () => void;
  duelId?: string;
}

interface GameState {
  deckPile: YugiohCard[];
  hand: YugiohCard[];
  field: YugiohCard[];
  graveyard: YugiohCard[];
  banished: YugiohCard[];
  extraDeckPile: YugiohCard[];
}

export const DuelDeckViewer = ({
  isOpen,
  onClose,
  deck,
  extraDeck,
  sideDeck,
  onLoadDeck,
  duelId,
}: DuelDeckViewerProps) => {
  const [gameState, setGameState] = useState<GameState>({
    deckPile: [],
    hand: [],
    field: [],
    graveyard: [],
    banished: [],
    extraDeckPile: [],
  });
  const [selectedCard, setSelectedCard] = useState<YugiohCard | null>(null);
  const [showDeckPile, setShowDeckPile] = useState(false);
  const [activeZone, setActiveZone] = useState<'hand' | 'field' | 'graveyard' | 'banished'>('hand');
  const [isMinimized, setIsMinimized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set(['hand', 'field']));

  // Sincronizar estado do deck com o oponente via Supabase Realtime
  useEffect(() => {
    if (!duelId || !isOpen) return;

    const channel = supabase.channel(`deck-sync-${duelId}`);
    
    channel
      .on('broadcast', { event: 'deck-state' }, ({ payload }) => {
        // Receber estado do oponente (apenas para visualização)
        console.log('Received opponent deck state:', payload);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [duelId, isOpen]);

  // Broadcast state changes
  const broadcastState = useCallback(() => {
    if (!duelId) return;
    
    const channel = supabase.channel(`deck-sync-${duelId}`);
    channel.send({
      type: 'broadcast',
      event: 'deck-state',
      payload: {
        hand: gameState.hand.length,
        field: gameState.field.map(c => ({ id: c.id, name: c.name, image: c.card_images[0]?.image_url_small })),
        graveyard: gameState.graveyard.map(c => ({ id: c.id, name: c.name, image: c.card_images[0]?.image_url_small })),
        banished: gameState.banished.map(c => ({ id: c.id, name: c.name, image: c.card_images[0]?.image_url_small })),
        deckCount: gameState.deckPile.length,
        extraCount: gameState.extraDeckPile.length,
      }
    });
  }, [duelId, gameState]);

  useEffect(() => {
    if (duelId && isOpen) {
      broadcastState();
    }
  }, [gameState.field, gameState.graveyard, gameState.banished, broadcastState, duelId, isOpen]);

  // Inicializar deck quando carregado
  useEffect(() => {
    if (deck.length > 0 || extraDeck.length > 0) {
      const expandedDeck: YugiohCard[] = [];
      deck.forEach(card => {
        for (let i = 0; i < card.quantity; i++) {
          expandedDeck.push({ ...card });
        }
      });

      const expandedExtra: YugiohCard[] = [];
      extraDeck.forEach(card => {
        for (let i = 0; i < card.quantity; i++) {
          expandedExtra.push({ ...card });
        }
      });

      setGameState({
        deckPile: shuffleArray(expandedDeck),
        hand: [],
        field: [],
        graveyard: [],
        banished: [],
        extraDeckPile: expandedExtra,
      });
    }
  }, [deck, extraDeck]);

  const shuffleArray = <T,>(array: T[]): T[] => {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
  };

  const drawCard = useCallback(() => {
    setGameState(prev => {
      if (prev.deckPile.length === 0) return prev;
      const [drawnCard, ...remaining] = prev.deckPile;
      return {
        ...prev,
        deckPile: remaining,
        hand: [...prev.hand, drawnCard],
      };
    });
  }, []);

  const drawMultiple = useCallback((count: number) => {
    setGameState(prev => {
      const toDraw = Math.min(count, prev.deckPile.length);
      const drawnCards = prev.deckPile.slice(0, toDraw);
      const remaining = prev.deckPile.slice(toDraw);
      return {
        ...prev,
        deckPile: remaining,
        hand: [...prev.hand, ...drawnCards],
      };
    });
  }, []);

  const shuffleDeck = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      deckPile: shuffleArray(prev.deckPile),
    }));
  }, []);

  const moveCardToZone = useCallback((card: YugiohCard, fromZone: keyof GameState, toZone: keyof GameState, cardIndex: number) => {
    setGameState(prev => {
      const fromArray = [...prev[fromZone]] as YugiohCard[];
      const toArray = [...prev[toZone]] as YugiohCard[];
      
      fromArray.splice(cardIndex, 1);
      toArray.push(card);
      
      return {
        ...prev,
        [fromZone]: fromArray,
        [toZone]: toArray,
      };
    });
  }, []);

  const returnAllToDeck = useCallback(() => {
    setGameState(prev => {
      const allCards = [
        ...prev.hand,
        ...prev.field,
        ...prev.graveyard,
        ...prev.banished,
      ];
      return {
        ...prev,
        deckPile: shuffleArray([...prev.deckPile, ...allCards]),
        hand: [],
        field: [],
        graveyard: [],
        banished: [],
      };
    });
  }, []);

  const returnToTopOfDeck = useCallback((card: YugiohCard, fromZone: keyof GameState, cardIndex: number) => {
    setGameState(prev => {
      const fromArray = [...prev[fromZone]] as YugiohCard[];
      fromArray.splice(cardIndex, 1);
      
      return {
        ...prev,
        [fromZone]: fromArray,
        deckPile: [card, ...prev.deckPile],
      };
    });
  }, []);

  // Buscar carta específica no deck
  const searchCardInDeck = useCallback((cardName: string) => {
    if (!cardName.trim()) return;
    
    setGameState(prev => {
      const lowerQuery = cardName.toLowerCase();
      const cardIndex = prev.deckPile.findIndex(c => 
        c.name.toLowerCase().includes(lowerQuery)
      );
      
      if (cardIndex === -1) return prev;
      
      const [foundCard] = prev.deckPile.splice(cardIndex, 1);
      const newDeckPile = [...prev.deckPile];
      
      return {
        ...prev,
        deckPile: newDeckPile,
        hand: [...prev.hand, foundCard],
      };
    });
    setSearchQuery('');
    setShowSearch(false);
  }, []);

  const toggleZoneExpanded = (zone: string) => {
    setExpandedZones(prev => {
      const newSet = new Set(prev);
      if (newSet.has(zone)) {
        newSet.delete(zone);
      } else {
        newSet.add(zone);
      }
      return newSet;
    });
  };

  const hasDeck = deck.length > 0 || extraDeck.length > 0;

  if (!isOpen) return null;

  const CardZone = ({ 
    title, 
    cards, 
    zone, 
    icon: Icon,
    isActive,
    color = 'primary'
  }: { 
    title: string; 
    cards: YugiohCard[]; 
    zone: 'hand' | 'field' | 'graveyard' | 'banished';
    icon: typeof Hand;
    isActive: boolean;
    color?: string;
  }) => {
    const isExpanded = expandedZones.has(zone);
    
    return (
      <div 
        className={cn(
          "flex flex-col border rounded-lg transition-colors",
          isActive ? "border-primary bg-primary/10" : "border-border/50 bg-muted/20",
          isFullscreen ? "flex-1" : ""
        )}
      >
        <div 
          className="flex items-center justify-between p-2 border-b border-border/50 cursor-pointer"
          onClick={() => {
            setActiveZone(zone);
            toggleZoneExpanded(zone);
          }}
        >
          <div className="flex items-center gap-1">
            <Icon className={cn("h-3 w-3", 
              zone === 'graveyard' ? 'text-orange-500' : 
              zone === 'banished' ? 'text-purple-500' : 
              zone === 'field' ? 'text-green-500' : 'text-blue-500'
            )} />
            <span className="text-xs font-medium">{title}</span>
          </div>
          <div className="flex items-center gap-1">
            <Badge variant="secondary" className="text-[10px] h-4 px-1">
              {cards.length}
            </Badge>
            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </div>
        </div>
        {isExpanded && (
          <ScrollArea className={cn("flex-1 p-1", isFullscreen ? "max-h-[200px]" : "max-h-[100px]")}>
            <div className={cn(
              "grid gap-1",
              isFullscreen ? "grid-cols-8 sm:grid-cols-10 md:grid-cols-12" : "grid-cols-5 sm:grid-cols-6"
            )}>
              {cards.map((card, idx) => (
                <div
                  key={`${card.id}-${idx}`}
                  className="relative group cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCard(card);
                  }}
                >
                  <img
                    src={card.card_images[0]?.image_url_small}
                    alt={card.name}
                    className="w-full rounded-sm shadow-sm hover:shadow-lg transition-all hover:scale-105 hover:z-10"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity rounded-sm flex flex-col items-center justify-center gap-0.5 p-0.5">
                    <span className="text-[8px] text-white text-center line-clamp-2">{card.name}</span>
                    <div className="flex gap-0.5 flex-wrap justify-center">
                      {zone !== 'field' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            moveCardToZone(card, zone, 'field', idx);
                          }}
                          className="p-0.5 bg-green-600 rounded text-[8px] text-white"
                          title="Campo"
                        >
                          ⬆️
                        </button>
                      )}
                      {zone !== 'graveyard' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            moveCardToZone(card, zone, 'graveyard', idx);
                          }}
                          className="p-0.5 bg-orange-600 rounded text-[8px] text-white"
                          title="Cemitério"
                        >
                          ⚰️
                        </button>
                      )}
                      {zone !== 'banished' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            moveCardToZone(card, zone, 'banished', idx);
                          }}
                          className="p-0.5 bg-purple-600 rounded text-[8px] text-white"
                          title="Banir"
                        >
                          🚫
                        </button>
                      )}
                      {zone !== 'hand' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            moveCardToZone(card, zone, 'hand', idx);
                          }}
                          className="p-0.5 bg-blue-600 rounded text-[8px] text-white"
                          title="Mão"
                        >
                          ✋
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          returnToTopOfDeck(card, zone, idx);
                        }}
                        className="p-0.5 bg-yellow-600 rounded text-[8px] text-white"
                        title="Topo do Deck"
                      >
                        📤
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    );
  };

  const containerClasses = isFullscreen
    ? "fixed inset-4 z-50 bg-card/98 backdrop-blur-md border border-border rounded-xl shadow-2xl flex flex-col"
    : cn(
        "fixed z-40 bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-2xl transition-all duration-300",
        isMinimized 
          ? "w-12 h-12 left-2 bottom-20" 
          : "w-80 sm:w-96 h-[500px] max-h-[70vh] left-2 bottom-20"
      );

  return (
    <div className={containerClasses}>
      {isMinimized ? (
        <button
          onClick={() => setIsMinimized(false)}
          className="w-full h-full flex items-center justify-center hover:bg-muted/50 rounded-lg"
        >
          <Layers className="h-6 w-6 text-primary" />
        </button>
      ) : (
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-2 border-b border-border">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">Deck de Duelo</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setIsFullscreen(!isFullscreen)}
                title={isFullscreen ? "Sair da Tela Cheia" : "Tela Cheia"}
              >
                {isFullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
              </Button>
              {!isFullscreen && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setIsMinimized(true)}
                >
                  <Minus className="h-3 w-3" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={onClose}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {!hasDeck ? (
            // Sem deck carregado
            <div className="flex-1 flex flex-col items-center justify-center p-4 gap-4">
              <BookOpen className="h-12 w-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground text-center">
                Nenhum deck carregado. Importe um deck para usar durante o duelo.
              </p>
              <Button onClick={onLoadDeck} className="gap-2">
                <Upload className="h-4 w-4" />
                Importar Deck (.ydk)
              </Button>
            </div>
          ) : (
            <>
              {/* Deck Controls */}
              <div className="flex items-center justify-between p-2 border-b border-border gap-1 flex-wrap">
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className="text-xs">
                    Deck: {gameState.deckPile.length}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    Extra: {gameState.extraDeckPile.length}
                  </Badge>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={drawCard}
                    disabled={gameState.deckPile.length === 0}
                  >
                    Comprar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={() => drawMultiple(5)}
                    disabled={gameState.deckPile.length === 0}
                  >
                    +5
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={shuffleDeck}
                    title="Embaralhar"
                  >
                    <Shuffle className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={returnAllToDeck}
                    title="Reiniciar"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setShowDeckPile(!showDeckPile)}
                    title={showDeckPile ? "Ocultar Deck" : "Ver Deck"}
                  >
                    {showDeckPile ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => setShowSearch(!showSearch)}
                    title="Buscar Carta"
                  >
                    <Search className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {/* Search Card */}
              {showSearch && (
                <div className="p-2 border-b border-border bg-muted/30">
                  <div className="flex gap-1">
                    <Input
                      placeholder="Nome da carta..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-7 text-xs"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          searchCardInDeck(searchQuery);
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      className="h-7 text-xs px-2"
                      onClick={() => searchCardInDeck(searchQuery)}
                      disabled={!searchQuery.trim() || gameState.deckPile.length === 0}
                    >
                      Buscar
                    </Button>
                  </div>
                  {gameState.deckPile.length > 0 && (
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      Sugestões: {gameState.deckPile.slice(0, 3).map(c => c.name).join(', ')}...
                    </div>
                  )}
                </div>
              )}

              {/* Deck Pile View */}
              {showDeckPile && (
                <div className="p-2 border-b border-border bg-muted/30">
                  <div className="text-xs font-medium mb-1">Deck ({gameState.deckPile.length})</div>
                  <ScrollArea className="h-16">
                    <div className="flex gap-0.5 flex-wrap">
                      {gameState.deckPile.map((card, idx) => (
                        <img
                          key={`deck-${card.id}-${idx}`}
                          src={card.card_images[0]?.image_url_small}
                          alt={card.name}
                          className="h-10 rounded-sm cursor-pointer hover:scale-110 transition-transform"
                          onClick={() => setSelectedCard(card)}
                          title={card.name}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* Card Zones */}
              <div className={cn(
                "flex-1 p-2 flex flex-col gap-2 min-h-0 overflow-auto",
                isFullscreen && "grid grid-cols-1 md:grid-cols-2 gap-4"
              )}>
                <CardZone 
                  title="Mão" 
                  cards={gameState.hand} 
                  zone="hand" 
                  icon={Hand}
                  isActive={activeZone === 'hand'}
                />
                <CardZone 
                  title="Campo" 
                  cards={gameState.field} 
                  zone="field" 
                  icon={Layers}
                  isActive={activeZone === 'field'}
                />
                <div className={cn("flex gap-2", isFullscreen ? "flex-col" : "")}>
                  <CardZone 
                    title="Cemitério" 
                    cards={gameState.graveyard} 
                    zone="graveyard" 
                    icon={Flame}
                    isActive={activeZone === 'graveyard'}
                    color="orange"
                  />
                  <CardZone 
                    title="Banido" 
                    cards={gameState.banished} 
                    zone="banished" 
                    icon={Ban}
                    isActive={activeZone === 'banished'}
                    color="purple"
                  />
                </div>
              </div>

              {/* Extra Deck */}
              {gameState.extraDeckPile.length > 0 && (
                <div className="p-2 border-t border-border">
                  <div className="text-xs font-medium mb-1">Extra Deck ({gameState.extraDeckPile.length})</div>
                  <ScrollArea className="h-12">
                    <div className="flex gap-0.5">
                      {gameState.extraDeckPile.map((card, idx) => (
                        <img
                          key={`extra-${card.id}-${idx}`}
                          src={card.card_images[0]?.image_url_small}
                          alt={card.name}
                          className="h-10 rounded-sm cursor-pointer hover:scale-110 transition-transform"
                          onClick={() => setSelectedCard(card)}
                          title={card.name}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Card Detail Modal */}
      {selectedCard && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={() => setSelectedCard(null)}
        >
          <div 
            className="bg-card rounded-lg p-4 max-w-sm w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex gap-4">
              <img
                src={selectedCard.card_images[0]?.image_url}
                alt={selectedCard.name}
                className="w-32 rounded-lg shadow-lg"
              />
              <div className="flex-1">
                <h3 className="font-bold text-sm mb-1">{selectedCard.name}</h3>
                <Badge variant="secondary" className="text-xs mb-2">
                  {selectedCard.type}
                </Badge>
                {selectedCard.atk !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    ATK: {selectedCard.atk} / DEF: {selectedCard.def}
                  </p>
                )}
                {selectedCard.level && (
                  <p className="text-xs text-muted-foreground">
                    Level: {selectedCard.level}
                  </p>
                )}
              </div>
            </div>
            <p className="text-xs mt-3 text-muted-foreground">{selectedCard.desc}</p>
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full mt-3"
              onClick={() => setSelectedCard(null)}
            >
              Fechar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};