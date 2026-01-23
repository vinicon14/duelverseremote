import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { 
  Layers, 
  Hand, 
  RotateCcw,
  Shuffle,
  X,
  Eye,
  EyeOff,
  Upload,
  Minus,
  BookOpen,
  Maximize2,
  Minimize2,
  Search,
  ChevronDown,
  ChevronUp,
  Flame,
  Ban,
  Sparkles,
  GripVertical,
  FlipVertical,
  RotateCw,
  Link2,
  Crown
} from 'lucide-react';
import { DeckCard } from '@/components/deckbuilder/DeckPanel';
import { YugiohCard } from '@/hooks/useYugiohCards';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { CardActionsModal } from './CardActionsModal';
import { OpponentFieldViewer } from './OpponentFieldViewer';

interface DuelDeckViewerProps {
  isOpen: boolean;
  onClose: () => void;
  deck: DeckCard[];
  extraDeck: DeckCard[];
  sideDeck: DeckCard[];
  onLoadDeck: () => void;
  duelId?: string;
  currentUserId?: string;
  opponentUsername?: string;
}

interface GameCard extends YugiohCard {
  instanceId: string;
  isFaceDown?: boolean;
  attachedCards?: GameCard[]; // For XYZ materials
  position?: 'attack' | 'defense'; // Card position
}

interface GameState {
  deckPile: GameCard[];
  hand: GameCard[];
  field: GameCard[];
  fieldZone: GameCard[]; // Field Spell zone
  graveyard: GameCard[];
  banished: GameCard[];
  extraDeckPile: GameCard[];
  sideDeckPile: GameCard[];
}

type ZoneType = keyof GameState;

const EXTRA_DECK_TYPES = ['Fusion', 'Synchro', 'XYZ', 'Link'];

const isExtraDeckCardType = (type: string): boolean => {
  return EXTRA_DECK_TYPES.some((t) => type.includes(t));
};

const isXYZCard = (type: string): boolean => type.includes('XYZ');

const generateInstanceId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Card back image for face-down cards
const CARD_BACK_URL = 'https://images.ygoprodeck.com/images/cards/back_high.jpg';

export const DuelDeckViewer = ({
  isOpen,
  onClose,
  deck,
  extraDeck,
  sideDeck,
  onLoadDeck,
  duelId,
  currentUserId,
  opponentUsername,
}: DuelDeckViewerProps) => {
  const [gameState, setGameState] = useState<GameState>({
    deckPile: [],
    hand: [],
    field: [],
    fieldZone: [],
    graveyard: [],
    banished: [],
    extraDeckPile: [],
    sideDeckPile: [],
  });
  
  // Card Actions Modal state
  const [selectedCard, setSelectedCard] = useState<GameCard | null>(null);
  const [selectedCardZone, setSelectedCardZone] = useState<ZoneType>('hand');
  const [selectedCardIndex, setSelectedCardIndex] = useState(0);
  const [showActionsModal, setShowActionsModal] = useState(false);
  
  // UI state
  const [showDeckPile, setShowDeckPile] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [expandedZones, setExpandedZones] = useState<Set<string>>(new Set(['hand', 'field', 'extraDeckPile']));
  
  // Drag and drop state
  const [draggedCard, setDraggedCard] = useState<{ card: GameCard; fromZone: ZoneType; index: number } | null>(null);
  
  // XYZ material attachment mode
  const [attachMode, setAttachMode] = useState<{ targetCard: GameCard; targetIndex: number } | null>(null);
  
  // Refs for preserving scroll positions
  const scrollPositionsRef = useRef<Record<string, number>>({});
  const zoneRefsMap = useRef<Record<string, HTMLDivElement | null>>({});

  // Broadcast state changes to opponent
  const broadcastState = useCallback(() => {
    if (!duelId || !currentUserId) return;
    
    const channel = supabase.channel(`deck-sync-${duelId}`);
    channel.send({
      type: 'broadcast',
      event: 'deck-state',
      payload: {
        userId: currentUserId,
        hand: gameState.hand.length,
        field: gameState.field.map(c => ({ 
          id: c.id, 
          name: c.isFaceDown ? 'Face-down Card' : c.name, 
          image: c.isFaceDown ? CARD_BACK_URL : c.card_images?.[0]?.image_url_small,
          isFaceDown: c.isFaceDown,
          position: c.position,
          materials: c.attachedCards?.length || 0
        })),
        fieldZone: gameState.fieldZone.map(c => ({
          id: c.id,
          name: c.name,
          image: c.card_images?.[0]?.image_url_small
        })),
        graveyard: gameState.graveyard.map(c => ({ 
          id: c.id, 
          name: c.name, 
          image: c.card_images?.[0]?.image_url_small 
        })),
        banished: gameState.banished.map(c => ({ 
          id: c.id, 
          name: c.name, 
          image: c.card_images?.[0]?.image_url_small 
        })),
        deckCount: gameState.deckPile.length,
        extraCount: gameState.extraDeckPile.length,
      }
    });
  }, [duelId, currentUserId, gameState]);

  useEffect(() => {
    if (duelId && isOpen && currentUserId) {
      broadcastState();
    }
  }, [gameState, broadcastState, duelId, isOpen, currentUserId]);

  // Initialize deck when loaded
  useEffect(() => {
    if (deck.length > 0 || extraDeck.length > 0 || sideDeck.length > 0) {
      const expandedDeck: GameCard[] = [];
      deck.forEach(card => {
        for (let i = 0; i < card.quantity; i++) {
          expandedDeck.push({ ...card, instanceId: generateInstanceId(), isFaceDown: false, position: 'attack' });
        }
      });

      const expandedExtra: GameCard[] = [];
      extraDeck.forEach(card => {
        for (let i = 0; i < card.quantity; i++) {
          expandedExtra.push({ ...card, instanceId: generateInstanceId(), isFaceDown: false, position: 'attack' });
        }
      });

      const expandedSide: GameCard[] = [];
      sideDeck.forEach(card => {
        for (let i = 0; i < card.quantity; i++) {
          expandedSide.push({ ...card, instanceId: generateInstanceId(), isFaceDown: false, position: 'attack' });
        }
      });

      setGameState({
        deckPile: shuffleArray(expandedDeck),
        hand: [],
        field: [],
        fieldZone: [],
        graveyard: [],
        banished: [],
        extraDeckPile: expandedExtra,
        sideDeckPile: expandedSide,
      });
    }
  }, [deck, extraDeck, sideDeck]);

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
        hand: [...prev.hand, { ...drawnCard, isFaceDown: false }],
      };
    });
  }, []);

  const drawMultiple = useCallback((count: number) => {
    setGameState(prev => {
      const toDraw = Math.min(count, prev.deckPile.length);
      const drawnCards = prev.deckPile.slice(0, toDraw).map(c => ({ ...c, isFaceDown: false }));
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

  // Set card face-down
  const setCardFaceDown = useCallback((zone: ZoneType, cardIndex: number, faceDown: boolean) => {
    setGameState(prev => {
      const array = [...prev[zone]] as GameCard[];
      if (array[cardIndex]) {
        array[cardIndex] = { ...array[cardIndex], isFaceDown: faceDown };
      }
      return { ...prev, [zone]: array };
    });
  }, []);

  // Toggle card position (attack/defense)
  const toggleCardPosition = useCallback((zone: ZoneType, cardIndex: number) => {
    setGameState(prev => {
      const array = [...prev[zone]] as GameCard[];
      if (array[cardIndex]) {
        array[cardIndex] = { 
          ...array[cardIndex], 
          position: array[cardIndex].position === 'attack' ? 'defense' : 'attack' 
        };
      }
      return { ...prev, [zone]: array };
    });
  }, []);

  // Flip card face-up
  const flipCardUp = useCallback((zone: ZoneType, cardIndex: number) => {
    setGameState(prev => {
      const array = [...prev[zone]] as GameCard[];
      if (array[cardIndex]) {
        array[cardIndex] = { ...array[cardIndex], isFaceDown: false };
      }
      return { ...prev, [zone]: array };
    });
  }, []);

  // Attach card as XYZ material
  const attachAsMaterial = useCallback((materialCard: GameCard, fromZone: ZoneType, materialIndex: number, targetIndex: number) => {
    setGameState(prev => {
      const fromArray = [...prev[fromZone]] as GameCard[];
      const fieldArray = [...prev.field];
      
      const [removedCard] = fromArray.splice(materialIndex, 1);
      if (removedCard && fieldArray[targetIndex]) {
        const attachedCards = fieldArray[targetIndex].attachedCards || [];
        fieldArray[targetIndex] = {
          ...fieldArray[targetIndex],
          attachedCards: [...attachedCards, removedCard]
        };
      }
      
      return {
        ...prev,
        [fromZone]: fromArray,
        field: fieldArray,
      };
    });
    setAttachMode(null);
  }, []);

  // Detach XYZ material - sends to graveyard and preserves scroll
  const detachMaterial = useCallback((fieldIndex: number, materialIndex: number) => {
    // Save scroll positions before update
    Object.keys(zoneRefsMap.current).forEach(zone => {
      const ref = zoneRefsMap.current[zone];
      if (ref) {
        scrollPositionsRef.current[zone] = ref.scrollTop;
      }
    });
    
    setGameState(prev => {
      const fieldArray = [...prev.field];
      if (fieldArray[fieldIndex]?.attachedCards && fieldArray[fieldIndex].attachedCards!.length > materialIndex) {
        const materials = [...fieldArray[fieldIndex].attachedCards!];
        const [detachedCard] = materials.splice(materialIndex, 1);
        
        if (detachedCard) {
          fieldArray[fieldIndex] = {
            ...fieldArray[fieldIndex],
            attachedCards: materials
          };
          return {
            ...prev,
            field: fieldArray,
            graveyard: [...prev.graveyard, { ...detachedCard, isFaceDown: false }],
          };
        }
      }
      return prev;
    });
    
    // Restore scroll positions after update
    requestAnimationFrame(() => {
      Object.keys(scrollPositionsRef.current).forEach(zone => {
        const ref = zoneRefsMap.current[zone];
        if (ref && scrollPositionsRef.current[zone] !== undefined) {
          ref.scrollTop = scrollPositionsRef.current[zone];
        }
      });
    });
  }, []);

  const moveCardToZone = useCallback((card: GameCard, fromZone: ZoneType, toZone: ZoneType, cardIndex: number) => {
    // Save scroll positions before update
    Object.keys(zoneRefsMap.current).forEach(zone => {
      const ref = zoneRefsMap.current[zone];
      if (ref) {
        scrollPositionsRef.current[zone] = ref.scrollTop;
      }
    });
    
    setGameState(prev => {
      const fromArray = [...prev[fromZone]] as GameCard[];
      const toArray = [...prev[toZone]] as GameCard[];
      
      const removedCard = fromArray.splice(cardIndex, 1)[0];
      if (removedCard) {
        // Clear face-down when moving to hand
        if (toZone === 'hand') {
          removedCard.isFaceDown = false;
        }
        toArray.push(removedCard);
      }
      
      return {
        ...prev,
        [fromZone]: fromArray,
        [toZone]: toArray,
      };
    });
    
    // Restore scroll positions after update
    requestAnimationFrame(() => {
      Object.keys(scrollPositionsRef.current).forEach(zone => {
        const ref = zoneRefsMap.current[zone];
        if (ref && scrollPositionsRef.current[zone] !== undefined) {
          ref.scrollTop = scrollPositionsRef.current[zone];
        }
      });
    });
  }, []);

  // Set/Baixar card face-down to field
  const setCardToField = useCallback((card: GameCard, fromZone: ZoneType, cardIndex: number) => {
    setGameState(prev => {
      const fromArray = [...prev[fromZone]] as GameCard[];
      const [removedCard] = fromArray.splice(cardIndex, 1);
      
      if (removedCard) {
        const setCard = { 
          ...removedCard, 
          isFaceDown: true, 
          position: 'defense' as const 
        };
        return {
          ...prev,
          [fromZone]: fromArray,
          field: [...prev.field, setCard],
        };
      }
      return prev;
    });
  }, []);

  const returnAllToDeck = useCallback(() => {
    setGameState(prev => {
      // Collect all materials from field cards
      const allMaterials = prev.field.flatMap(c => c.attachedCards || []);
      
      const allCards = [
        ...prev.hand,
        ...prev.field.map(c => ({ ...c, attachedCards: undefined, isFaceDown: false })),
        ...allMaterials,
        ...prev.fieldZone,
        ...prev.graveyard,
        ...prev.banished,
      ];
      return {
        ...prev,
        deckPile: shuffleArray([...prev.deckPile, ...allCards]),
        hand: [],
        field: [],
        fieldZone: [],
        graveyard: [],
        banished: [],
      };
    });
  }, []);

  const returnToTopOfDeck = useCallback((card: GameCard, fromZone: ZoneType, cardIndex: number) => {
    setGameState(prev => {
      const fromArray = [...prev[fromZone]] as GameCard[];
      fromArray.splice(cardIndex, 1);
      
      return {
        ...prev,
        [fromZone]: fromArray,
        deckPile: [{ ...card, isFaceDown: false }, ...prev.deckPile],
      };
    });
  }, []);

  const returnToBottomOfDeck = useCallback((card: GameCard, fromZone: ZoneType, cardIndex: number) => {
    setGameState(prev => {
      const fromArray = [...prev[fromZone]] as GameCard[];
      fromArray.splice(cardIndex, 1);
      
      return {
        ...prev,
        [fromZone]: fromArray,
        deckPile: [...prev.deckPile, { ...card, isFaceDown: false }],
      };
    });
  }, []);

  const shuffleIntoDeck = useCallback((card: GameCard, fromZone: ZoneType, cardIndex: number) => {
    setGameState(prev => {
      const fromArray = [...prev[fromZone]] as GameCard[];
      fromArray.splice(cardIndex, 1);
      
      return {
        ...prev,
        [fromZone]: fromArray,
        deckPile: shuffleArray([...prev.deckPile, { ...card, isFaceDown: false }]),
      };
    });
  }, []);

  const sendToExtraDeck = useCallback((card: GameCard, fromZone: ZoneType, cardIndex: number) => {
    setGameState(prev => {
      const fromArray = [...prev[fromZone]] as GameCard[];
      fromArray.splice(cardIndex, 1);
      
      return {
        ...prev,
        [fromZone]: fromArray,
        extraDeckPile: [...prev.extraDeckPile, { ...card, isFaceDown: false }],
      };
    });
  }, []);

  const searchCardInDeck = useCallback((cardName: string) => {
    if (!cardName.trim()) return;
    
    setGameState(prev => {
      const lowerQuery = cardName.toLowerCase();
      const cardIndex = prev.deckPile.findIndex(c => 
        c.name.toLowerCase().includes(lowerQuery)
      );
      
      if (cardIndex === -1) return prev;
      
      const newDeckPile = [...prev.deckPile];
      const [foundCard] = newDeckPile.splice(cardIndex, 1);
      
      return {
        ...prev,
        deckPile: newDeckPile,
        hand: [...prev.hand, { ...foundCard, isFaceDown: false }],
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

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, card: GameCard, fromZone: ZoneType, index: number) => {
    setDraggedCard({ card, fromZone, index });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.instanceId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, toZone: ZoneType) => {
    e.preventDefault();
    if (!draggedCard) return;
    
    const { card, fromZone, index } = draggedCard;
    if (fromZone !== toZone) {
      moveCardToZone(card, fromZone, toZone, index);
    }
    setDraggedCard(null);
  };

  const handleDragEnd = () => {
    setDraggedCard(null);
  };

  const handleCardClick = (card: GameCard, zone: ZoneType, index: number) => {
    // If in attach mode, attach this card as material
    if (attachMode && zone !== 'field') {
      attachAsMaterial(card, zone, index, attachMode.targetIndex);
      return;
    }
    
    setSelectedCard(card);
    setSelectedCardZone(zone);
    setSelectedCardIndex(index);
    setShowActionsModal(true);
  };

  // Calculate total cards
  const totalMainDeck = deck.reduce((acc, c) => acc + c.quantity, 0);
  const totalExtraDeck = extraDeck.reduce((acc, c) => acc + c.quantity, 0);
  const hasDeck = totalMainDeck > 0 || totalExtraDeck > 0;

  if (!isOpen) return null;

  // Save scroll position before state update
  const saveScrollPosition = useCallback((zone: string) => {
    const ref = zoneRefsMap.current[zone];
    if (ref) {
      scrollPositionsRef.current[zone] = ref.scrollTop;
    }
  }, []);
  
  // Restore scroll position after state update
  const restoreScrollPosition = useCallback((zone: string) => {
    requestAnimationFrame(() => {
      const ref = zoneRefsMap.current[zone];
      if (ref && scrollPositionsRef.current[zone] !== undefined) {
        ref.scrollTop = scrollPositionsRef.current[zone];
      }
    });
  }, []);
  
  // Save all scroll positions
  const saveAllScrollPositions = useCallback(() => {
    Object.keys(zoneRefsMap.current).forEach(zone => {
      saveScrollPosition(zone);
    });
  }, [saveScrollPosition]);
  
  // Restore all scroll positions
  const restoreAllScrollPositions = useCallback(() => {
    Object.keys(scrollPositionsRef.current).forEach(zone => {
      restoreScrollPosition(zone);
    });
  }, [restoreScrollPosition]);

  const CardZone = ({ 
    title, 
    cards, 
    zone, 
    icon: Icon,
  }: { 
    title: string; 
    cards: GameCard[]; 
    zone: ZoneType;
    icon: typeof Hand;
  }) => {
    const isExpanded = expandedZones.has(zone);
    const cardCount = cards.length;
    const isDragOver = draggedCard && draggedCard.fromZone !== zone;
    
    return (
      <div 
        className={cn(
          "flex flex-col border rounded-lg transition-all",
          isDragOver ? "border-primary border-dashed bg-primary/5" : "border-border/50 bg-muted/20",
          isFullscreen ? "flex-1" : ""
        )}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, zone)}
      >
        <div 
          className="flex items-center justify-between p-2 border-b border-border/50 cursor-pointer"
          onClick={() => toggleZoneExpanded(zone)}
        >
          <div className="flex items-center gap-1">
            <Icon className={cn("h-3 w-3", 
              zone === 'graveyard' ? 'text-orange-500' : 
              zone === 'banished' ? 'text-purple-500' : 
              zone === 'field' ? 'text-green-500' : 
              zone === 'fieldZone' ? 'text-emerald-500' :
              zone === 'extraDeckPile' ? 'text-yellow-500' :
              zone === 'sideDeckPile' ? 'text-cyan-500' : 'text-blue-500'
            )} />
            <span className="text-xs font-medium">{title}</span>
          </div>
          <div className="flex items-center gap-1">
            <Badge variant="secondary" className="text-[10px] h-4 px-1">
              {cardCount}
            </Badge>
            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </div>
        </div>
        {isExpanded && (
          <div 
            ref={(el) => { zoneRefsMap.current[zone] = el; }}
            className={cn(
              "p-1 overflow-y-auto overflow-x-hidden",
              isFullscreen ? "max-h-[200px]" : "max-h-[150px]"
            )}
          >
            <div className={cn(
              "grid gap-1",
              isFullscreen ? "grid-cols-8 sm:grid-cols-10 md:grid-cols-12" : "grid-cols-5 sm:grid-cols-6"
            )}>
              {cards.map((card, idx) => (
                <div
                  key={card.instanceId}
                  className={cn(
                    "relative group cursor-pointer",
                    draggedCard?.card.instanceId === card.instanceId && "opacity-50",
                    attachMode && zone !== 'field' && "ring-2 ring-yellow-400 animate-pulse"
                  )}
                  draggable
                  onDragStart={(e) => handleDragStart(e, card, zone, idx)}
                  onDragEnd={handleDragEnd}
                  onClick={() => handleCardClick(card, zone, idx)}
                >
                  <div className="absolute top-0 left-0 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                    <GripVertical className="h-3 w-3 text-white drop-shadow-lg" />
                  </div>
                  
                  {/* Face-down indicator */}
                  {card.isFaceDown && zone === 'field' && (
                    <div className="absolute top-0 right-0 z-10">
                      <EyeOff className="h-3 w-3 text-red-500 drop-shadow-lg" />
                    </div>
                  )}
                  
                  {/* Position indicator */}
                  {zone === 'field' && card.position === 'defense' && (
                    <div className="absolute bottom-0 left-0 z-10">
                      <RotateCw className="h-3 w-3 text-blue-400 drop-shadow-lg" />
                    </div>
                  )}
                  
                  {/* XYZ materials count */}
                  {card.attachedCards && card.attachedCards.length > 0 && (
                    <div className="absolute bottom-0 right-0 z-10">
                      <Badge className="text-[8px] h-3 px-1 bg-yellow-600">
                        {card.attachedCards.length}
                      </Badge>
                    </div>
                  )}
                  
                  <img
                    src={card.isFaceDown ? CARD_BACK_URL : card.card_images?.[0]?.image_url_small}
                    alt={card.isFaceDown ? 'Face-down card' : card.name}
                    className={cn(
                      "w-full rounded-sm shadow-sm hover:shadow-lg transition-all hover:scale-105 hover:z-10",
                      card.position === 'defense' && zone === 'field' && "rotate-90"
                    )}
                    loading="lazy"
                    title={card.isFaceDown ? 'Face-down card' : card.name}
                  />
                </div>
              ))}
            </div>
          </div>
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
          : "w-80 sm:w-96 h-[650px] max-h-[85vh] left-2 bottom-20"
      );

  return (
    <>
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
                <span className="font-semibold text-sm">Duelingbook</span>
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

            {/* Attach mode banner */}
            {attachMode && (
              <div className="bg-yellow-500/20 border-b border-yellow-500 p-2 flex items-center justify-between">
                <span className="text-xs text-yellow-600 flex items-center gap-1">
                  <Link2 className="h-3 w-3" />
                  Selecione uma carta para anexar como material
                </span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-5 px-2 text-xs"
                  onClick={() => setAttachMode(null)}
                >
                  Cancelar
                </Button>
              </div>
            )}

            {!hasDeck ? (
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
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-2">
                  {/* Opponent Field (if in duel) */}
                  {duelId && currentUserId && (
                    <OpponentFieldViewer 
                      duelId={duelId} 
                      currentUserId={currentUserId}
                      opponentUsername={opponentUsername}
                    />
                  )}

                  {/* Deck Controls */}
                  <div className="flex items-center justify-between gap-1 flex-wrap p-2 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-1 flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        Deck: {gameState.deckPile.length}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        Extra: {gameState.extraDeckPile.length}
                      </Badge>
                      {gameState.sideDeckPile.length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          Side: {gameState.sideDeckPile.length}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setShowSearch(!showSearch)}
                        title="Buscar Carta"
                      >
                        <Search className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setShowDeckPile(!showDeckPile)}
                        title={showDeckPile ? "Esconder Deck" : "Ver Deck"}
                      >
                        {showDeckPile ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={shuffleDeck}
                        title="Embaralhar"
                      >
                        <Shuffle className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={returnAllToDeck}
                        title="Resetar"
                      >
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Search */}
                  {showSearch && (
                    <div className="flex gap-1">
                      <Input
                        placeholder="Nome da carta..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && searchCardInDeck(searchQuery)}
                        className="h-7 text-xs"
                      />
                      <Button 
                        size="sm" 
                        className="h-7 px-2"
                        onClick={() => searchCardInDeck(searchQuery)}
                      >
                        <Search className="h-3 w-3" />
                      </Button>
                    </div>
                  )}

                  {/* Draw Buttons */}
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-7 text-xs"
                      onClick={drawCard}
                      disabled={gameState.deckPile.length === 0}
                    >
                      Comprar 1
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-7 text-xs"
                      onClick={() => drawMultiple(5)}
                      disabled={gameState.deckPile.length === 0}
                    >
                      Comprar 5
                    </Button>
                  </div>

                  {/* Deck Pile View */}
                  {showDeckPile && (
                    <CardZone 
                      title="Deck Principal" 
                      cards={gameState.deckPile} 
                      zone="deckPile" 
                      icon={Layers}
                    />
                  )}

                  {/* Main Zones */}
                  <CardZone title="Mão" cards={gameState.hand} zone="hand" icon={Hand} />
                  <CardZone title="Campo" cards={gameState.field} zone="field" icon={Layers} />
                  
                  {/* Field Zone */}
                  {(gameState.fieldZone.length > 0 || expandedZones.has('fieldZone')) && (
                    <CardZone title="Zona de Campo" cards={gameState.fieldZone} zone="fieldZone" icon={Crown} />
                  )}
                  
                  <CardZone title="Cemitério" cards={gameState.graveyard} zone="graveyard" icon={Flame} />
                  <CardZone title="Banidos" cards={gameState.banished} zone="banished" icon={Ban} />
                  
                  {/* Extra Deck */}
                  <CardZone 
                    title="Extra Deck" 
                    cards={gameState.extraDeckPile} 
                    zone="extraDeckPile" 
                    icon={Sparkles}
                  />
                  
                  {/* Side Deck */}
                  {gameState.sideDeckPile.length > 0 && (
                    <CardZone 
                      title="Side Deck" 
                      cards={gameState.sideDeckPile} 
                      zone="sideDeckPile" 
                      icon={Layers}
                    />
                  )}
                </div>
              </ScrollArea>
            )}
          </div>
        )}
      </div>

      {/* Card Actions Modal */}
      <CardActionsModal
        card={selectedCard}
        open={showActionsModal}
        onClose={() => setShowActionsModal(false)}
        currentZone={selectedCardZone}
        cardIndex={selectedCardIndex}
        onMoveToZone={(toZone) => {
          if (selectedCard) {
            moveCardToZone(selectedCard, selectedCardZone, toZone, selectedCardIndex);
          }
        }}
        onSetFaceDown={() => {
          if (selectedCard && selectedCardZone === 'hand') {
            setCardToField(selectedCard, selectedCardZone, selectedCardIndex);
          } else if (selectedCard && selectedCardZone === 'field') {
            setCardFaceDown(selectedCardZone, selectedCardIndex, true);
          }
        }}
        onFlipFaceUp={() => {
          if (selectedCard) {
            flipCardUp(selectedCardZone, selectedCardIndex);
          }
        }}
        onTogglePosition={() => {
          if (selectedCard) {
            toggleCardPosition(selectedCardZone, selectedCardIndex);
          }
        }}
        onAttachMaterial={() => {
          if (selectedCard && selectedCardZone === 'field') {
            setAttachMode({ targetCard: selectedCard, targetIndex: selectedCardIndex });
            setShowActionsModal(false);
          }
        }}
        onDetachMaterial={(materialIndex) => {
          if (selectedCard) {
            detachMaterial(selectedCardIndex, materialIndex);
          }
        }}
        onReturnToTopOfDeck={() => {
          if (selectedCard) {
            returnToTopOfDeck(selectedCard, selectedCardZone, selectedCardIndex);
          }
        }}
        onReturnToBottomOfDeck={() => {
          if (selectedCard) {
            returnToBottomOfDeck(selectedCard, selectedCardZone, selectedCardIndex);
          }
        }}
        onShuffleIntoDeck={() => {
          if (selectedCard) {
            shuffleIntoDeck(selectedCard, selectedCardZone, selectedCardIndex);
          }
        }}
        onSendToExtraDeck={() => {
          if (selectedCard) {
            sendToExtraDeck(selectedCard, selectedCardZone, selectedCardIndex);
          }
        }}
        onMoveToFieldZone={() => {
          if (selectedCard) {
            moveCardToZone(selectedCard, selectedCardZone, 'fieldZone', selectedCardIndex);
          }
        }}
        isExtraDeckCard={selectedCard ? isExtraDeckCardType(selectedCard.type) : false}
        isXYZCard={selectedCard ? isXYZCard(selectedCard.type) : false}
        isFaceDown={selectedCard?.isFaceDown || false}
        isOnField={selectedCardZone === 'field'}
        isFieldSpell={selectedCard?.type?.includes('Field') || false}
        attachedMaterials={selectedCard?.attachedCards || []}
      />
    </>
  );
};
