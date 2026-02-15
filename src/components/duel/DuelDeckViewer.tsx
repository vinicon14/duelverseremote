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
  GripVertical,
  Move,
  ArrowLeftRight,
  Zap,
  Ban
} from 'lucide-react';
import { DeckCard } from '@/components/deckbuilder/DeckPanel';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { DuelFieldBoard, FieldState, FieldZoneType, GameCard } from './DuelFieldBoard';
import { CardEffectModal } from './CardEffectModal';
import { ZonePlacementModal } from './ZonePlacementModal';
import { ZoneViewerModal } from './ZoneViewerModal';
import { FieldCardActionsModal } from './FieldCardActionsModal';
import { SideDeckSwapModal } from './SideDeckSwapModal';
import { useDraggable } from '@/hooks/useDraggable';

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

const EXTRA_DECK_TYPES = ['Fusion', 'Synchro', 'XYZ', 'Link'];

const MONSTER_ZONES: FieldZoneType[] = ['monster1', 'monster2', 'monster3', 'monster4', 'monster5'];
const EXTRA_MONSTER_ZONES: FieldZoneType[] = ['extraMonster1', 'extraMonster2'];
const SPELL_TRAP_ZONES: FieldZoneType[] = ['spell1', 'spell2', 'spell3', 'spell4', 'spell5'];

type CardSourceZone = 'hand' | 'deck' | 'extraDeck' | 'graveyard' | 'banished';

const isSpellCard = (type: string): boolean => {
  return type.toLowerCase().includes('spell') && !type.toLowerCase().includes('trap');
};

const isTrapCard = (type: string): boolean => {
  return type.toLowerCase().includes('trap');
};

const isSpellOrTrap = (type: string): boolean => {
  return isSpellCard(type) || isTrapCard(type);
};

const isMonsterCard = (type: string): boolean => {
  if (isSpellCard(type) || isTrapCard(type)) return false;
  return type.toLowerCase().includes('monster');
};

const isTokenCard = (card: GameCard): boolean => {
  return card.name.toLowerCase().includes('token') || 
         card.type.toLowerCase().includes('token');
};

interface PriorityZoneResult {
  zone: FieldZoneType | null;
  faceDown: boolean;
}

const isFieldSpell = (card: GameCard): boolean => {
  const type = card.type?.toLowerCase() || '';
  const name = card.name?.toLowerCase() || '';
  const race = card.race?.toLowerCase() || '';
  // Check if card is a Field Spell - check type, name, and race for "field"
  return type.includes('field') || name.includes('field') || race === 'field';
};

const findPriorityZone = (
  card: GameCard,
  sourceZone: CardSourceZone,
  occupiedZones: FieldZoneType[]
): PriorityZoneResult => {
  const isMonster = isMonsterCard(card.type);
  const isSpellOrTrapCard = isSpellOrTrap(card.type);
  const isExtraDeck = isExtraDeckCardType(card.type);
  const isToken = isTokenCard(card);
  const isField = isFieldSpell(card);

  const isZoneOccupied = (zone: FieldZoneType) => occupiedZones.includes(zone);

  // Field Spells go to the Field Spell zone, face-up
  if (isField) {
    if (!isZoneOccupied('fieldSpell')) {
      return { zone: 'fieldSpell', faceDown: false };
    }
  } else if (isMonster || isToken) {
    let priorityZones: FieldZoneType[];
    
    if (isExtraDeck && !isToken) {
      // Extra Deck monsters: Extra Monster Zone 1 first, then Main Zones 1-5
      // Extra Monster Zone 2 is NOT used for auto-summon
      priorityZones = ['extraMonster1', 'monster1', 'monster2', 'monster3', 'monster4', 'monster5'];
    } else {
      // Normal monsters and tokens: Main Zones 1-5
      priorityZones = MONSTER_ZONES;
    }

    for (const zone of priorityZones) {
      if (!isZoneOccupied(zone)) {
        return { zone, faceDown: false };
      }
    }
  } else if (isSpellOrTrapCard) {
    for (const zone of SPELL_TRAP_ZONES) {
      if (!isZoneOccupied(zone)) {
        return { zone, faceDown: true };
      }
    }
  }

  return { zone: null, faceDown: false };
};

const isExtraDeckCardType = (type: string): boolean => {
  return EXTRA_DECK_TYPES.some((t) => type.includes(t));
};

const generateInstanceId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const CARD_BACK_URL = 'https://images.ygoprodeck.com/images/cards/back_high.jpg';

const INITIAL_FIELD_STATE: FieldState = {
  monster1: null,
  monster2: null,
  monster3: null,
  monster4: null,
  monster5: null,
  spell1: null,
  spell2: null,
  spell3: null,
  spell4: null,
  spell5: null,
  extraMonster1: null,
  extraMonster2: null,
  fieldSpell: null,
  graveyard: [],
  banished: [],
  extraDeck: [],
  deck: [],
  sideDeck: [],
  hand: [],
};

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
  const [selectedEffectCard, setSelectedEffectCard] = useState<GameCard | null>(null);
  const [effectModalOpen, setEffectModalOpen] = useState(false);
  const [fieldState, setFieldState] = useState<FieldState>(INITIAL_FIELD_STATE);
  
  // Modal states
  const [placementModal, setPlacementModal] = useState<{ open: boolean; card: GameCard | null }>({ 
    open: false, 
    card: null 
  });
  const [viewerModal, setViewerModal] = useState<{ 
    open: boolean; 
    zone: FieldZoneType | 'hand' | null 
  }>({ open: false, zone: null });
  const [cardActionsModal, setCardActionsModal] = useState<{ 
    open: boolean; 
    card: GameCard | null; 
    zone: FieldZoneType | null 
  }>({ open: false, card: null, zone: null });
  
  // UI state
  const [isMinimized, setIsMinimized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [attachMode, setAttachMode] = useState<{ targetZone: FieldZoneType; cardToAttach: GameCard } | null>(null);
  const [showSideSwap, setShowSideSwap] = useState(false);

  // Draggable functionality
  const { position, isDragging, elementRef, dragHandlers } = useDraggable({
    initialPosition: { x: 8, y: 80 },
  });

  // Persistent channel for broadcasting
  const [broadcastChannel, setBroadcastChannel] = useState<ReturnType<typeof supabase.channel> | null>(null);

  // Setup broadcast channel
  useEffect(() => {
    if (!duelId || !currentUserId) return;
    
    const channel = supabase.channel(`deck-sync-${duelId}`);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setBroadcastChannel(channel);
      }
    });

    return () => {
      supabase.removeChannel(channel);
      setBroadcastChannel(null);
    };
  }, [duelId, currentUserId]);

  // Broadcast state changes to opponent
  const broadcastState = useCallback(() => {
    if (!broadcastChannel || !currentUserId) return;
    
    const getFieldCards = (): { id: number; name: string; image: string; isFaceDown?: boolean; position?: string; materials?: number; zone: string }[] => {
      const zones: FieldZoneType[] = [
        'monster1', 'monster2', 'monster3', 'monster4', 'monster5',
        'spell1', 'spell2', 'spell3', 'spell4', 'spell5',
        'extraMonster1', 'extraMonster2', 'fieldSpell'
      ];
      
      return zones
        .map(zone => {
          const card = fieldState[zone] as GameCard | null;
          if (!card) return null;
          return {
            id: card.id,
            name: card.isFaceDown ? 'Face-down Card' : card.name,
            image: card.isFaceDown ? CARD_BACK_URL : card.card_images?.[0]?.image_url_small || '',
            isFaceDown: card.isFaceDown,
            position: card.position,
            materials: card.attachedCards?.length || 0,
            zone: zone
          };
        })
        .filter((card): card is NonNullable<typeof card> => card !== null);
    };

    broadcastChannel.send({
      type: 'broadcast',
      event: 'deck-state',
      payload: {
        userId: currentUserId,
        hand: fieldState.hand.length,
        field: getFieldCards(),
        monsterZones: {
          monster1: fieldState.monster1 ? { id: fieldState.monster1.id, name: fieldState.monster1.isFaceDown ? 'Face-down' : fieldState.monster1.name, image: fieldState.monster1.isFaceDown ? CARD_BACK_URL : fieldState.monster1.card_images?.[0]?.image_url_small, isFaceDown: fieldState.monster1.isFaceDown, position: fieldState.monster1.position, materials: fieldState.monster1.attachedCards?.length || 0 } : null,
          monster2: fieldState.monster2 ? { id: fieldState.monster2.id, name: fieldState.monster2.isFaceDown ? 'Face-down' : fieldState.monster2.name, image: fieldState.monster2.isFaceDown ? CARD_BACK_URL : fieldState.monster2.card_images?.[0]?.image_url_small, isFaceDown: fieldState.monster2.isFaceDown, position: fieldState.monster2.position, materials: fieldState.monster2.attachedCards?.length || 0 } : null,
          monster3: fieldState.monster3 ? { id: fieldState.monster3.id, name: fieldState.monster3.isFaceDown ? 'Face-down' : fieldState.monster3.name, image: fieldState.monster3.isFaceDown ? CARD_BACK_URL : fieldState.monster3.card_images?.[0]?.image_url_small, isFaceDown: fieldState.monster3.isFaceDown, position: fieldState.monster3.position, materials: fieldState.monster3.attachedCards?.length || 0 } : null,
          monster4: fieldState.monster4 ? { id: fieldState.monster4.id, name: fieldState.monster4.isFaceDown ? 'Face-down' : fieldState.monster4.name, image: fieldState.monster4.isFaceDown ? CARD_BACK_URL : fieldState.monster4.card_images?.[0]?.image_url_small, isFaceDown: fieldState.monster4.isFaceDown, position: fieldState.monster4.position, materials: fieldState.monster4.attachedCards?.length || 0 } : null,
          monster5: fieldState.monster5 ? { id: fieldState.monster5.id, name: fieldState.monster5.isFaceDown ? 'Face-down' : fieldState.monster5.name, image: fieldState.monster5.isFaceDown ? CARD_BACK_URL : fieldState.monster5.card_images?.[0]?.image_url_small, isFaceDown: fieldState.monster5.isFaceDown, position: fieldState.monster5.position, materials: fieldState.monster5.attachedCards?.length || 0 } : null,
        },
        spellZones: {
          spell1: fieldState.spell1 ? { id: fieldState.spell1.id, name: fieldState.spell1.isFaceDown ? 'Face-down' : fieldState.spell1.name, image: fieldState.spell1.isFaceDown ? CARD_BACK_URL : fieldState.spell1.card_images?.[0]?.image_url_small, isFaceDown: fieldState.spell1.isFaceDown } : null,
          spell2: fieldState.spell2 ? { id: fieldState.spell2.id, name: fieldState.spell2.isFaceDown ? 'Face-down' : fieldState.spell2.name, image: fieldState.spell2.isFaceDown ? CARD_BACK_URL : fieldState.spell2.card_images?.[0]?.image_url_small, isFaceDown: fieldState.spell2.isFaceDown } : null,
          spell3: fieldState.spell3 ? { id: fieldState.spell3.id, name: fieldState.spell3.isFaceDown ? 'Face-down' : fieldState.spell3.name, image: fieldState.spell3.isFaceDown ? CARD_BACK_URL : fieldState.spell3.card_images?.[0]?.image_url_small, isFaceDown: fieldState.spell3.isFaceDown } : null,
          spell4: fieldState.spell4 ? { id: fieldState.spell4.id, name: fieldState.spell4.isFaceDown ? 'Face-down' : fieldState.spell4.name, image: fieldState.spell4.isFaceDown ? CARD_BACK_URL : fieldState.spell4.card_images?.[0]?.image_url_small, isFaceDown: fieldState.spell4.isFaceDown } : null,
          spell5: fieldState.spell5 ? { id: fieldState.spell5.id, name: fieldState.spell5.isFaceDown ? 'Face-down' : fieldState.spell5.name, image: fieldState.spell5.isFaceDown ? CARD_BACK_URL : fieldState.spell5.card_images?.[0]?.image_url_small, isFaceDown: fieldState.spell5.isFaceDown } : null,
        },
        extraMonsterZones: {
          extraMonster1: fieldState.extraMonster1 ? { id: fieldState.extraMonster1.id, name: fieldState.extraMonster1.isFaceDown ? 'Face-down' : fieldState.extraMonster1.name, image: fieldState.extraMonster1.isFaceDown ? CARD_BACK_URL : fieldState.extraMonster1.card_images?.[0]?.image_url_small, materials: fieldState.extraMonster1.attachedCards?.length || 0 } : null,
          extraMonster2: fieldState.extraMonster2 ? { id: fieldState.extraMonster2.id, name: fieldState.extraMonster2.isFaceDown ? 'Face-down' : fieldState.extraMonster2.name, image: fieldState.extraMonster2.isFaceDown ? CARD_BACK_URL : fieldState.extraMonster2.card_images?.[0]?.image_url_small, materials: fieldState.extraMonster2.attachedCards?.length || 0 } : null,
        },
        fieldSpell: fieldState.fieldSpell ? { id: fieldState.fieldSpell.id, name: fieldState.fieldSpell.isFaceDown ? 'Face-down' : fieldState.fieldSpell.name, image: fieldState.fieldSpell.isFaceDown ? CARD_BACK_URL : fieldState.fieldSpell.card_images?.[0]?.image_url_small, isFaceDown: fieldState.fieldSpell.isFaceDown } : null,
        graveyard: fieldState.graveyard.map(c => ({ 
          id: c.id, 
          name: c.name, 
          image: c.card_images?.[0]?.image_url_small 
        })),
        banished: fieldState.banished.map(c => ({ 
          id: c.id, 
          name: c.name, 
          image: c.card_images?.[0]?.image_url_small 
        })),
        deckCount: fieldState.deck.length,
        extraCount: fieldState.extraDeck.length,
      }
    });
  }, [broadcastChannel, currentUserId, fieldState]);

  useEffect(() => {
    if (broadcastChannel && isOpen && currentUserId) {
      broadcastState();
    }
  }, [fieldState, broadcastState, broadcastChannel, isOpen, currentUserId]);

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

      setFieldState({
        ...INITIAL_FIELD_STATE,
        deck: shuffleArray(expandedDeck),
        extraDeck: expandedExtra,
        sideDeck: expandedSide,
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
    setFieldState(prev => {
      if (prev.deck.length === 0) return prev;
      // Random draw - select a random card from the deck
      const randomIndex = Math.floor(Math.random() * prev.deck.length);
      const drawnCard = prev.deck[randomIndex];
      const remaining = prev.deck.filter((_, idx) => idx !== randomIndex);
      return {
        ...prev,
        deck: remaining,
        hand: [...prev.hand, { ...drawnCard, isFaceDown: false }],
      };
    });
  }, []);

  const drawMultiple = useCallback((count: number) => {
    setFieldState(prev => {
      const toDraw = Math.min(count, prev.deck.length);
      if (toDraw === 0) return prev;
      
      // Random draw - select random cards from the deck
      const deckCopy = [...prev.deck];
      const drawnCards: GameCard[] = [];
      
      for (let i = 0; i < toDraw; i++) {
        const randomIndex = Math.floor(Math.random() * deckCopy.length);
        drawnCards.push({ ...deckCopy[randomIndex], isFaceDown: false });
        deckCopy.splice(randomIndex, 1);
      }
      
      return {
        ...prev,
        deck: deckCopy,
        hand: [...prev.hand, ...drawnCards],
      };
    });
  }, []);

  const shuffleDeck = useCallback(() => {
    setFieldState(prev => ({
      ...prev,
      deck: shuffleArray(prev.deck),
    }));
  }, []);

  const returnAllToDeck = useCallback(() => {
    setFieldState(prev => {
      const fieldZones: FieldZoneType[] = [
        'monster1', 'monster2', 'monster3', 'monster4', 'monster5',
        'spell1', 'spell2', 'spell3', 'spell4', 'spell5',
        'extraMonster1', 'extraMonster2', 'fieldSpell'
      ];
      
      const cardsFromField: GameCard[] = [];
      const extraCards: GameCard[] = [];
      
      fieldZones.forEach(zone => {
        const card = prev[zone] as GameCard | null;
        if (card) {
          // Return materials to GY
          if (card.attachedCards) {
            cardsFromField.push(...card.attachedCards);
          }
          // Check if extra deck card
          if (isExtraDeckCardType(card.type)) {
            extraCards.push({ ...card, attachedCards: undefined, isFaceDown: false });
          } else {
            cardsFromField.push({ ...card, attachedCards: undefined, isFaceDown: false });
          }
        }
      });

      const mainDeckCards = [
        ...prev.hand,
        ...cardsFromField.filter(c => !isExtraDeckCardType(c.type)),
        ...prev.graveyard.filter(c => !isExtraDeckCardType(c.type)),
        ...prev.banished.filter(c => !isExtraDeckCardType(c.type)),
      ];

      const extraDeckCards = [
        ...prev.extraDeck,
        ...extraCards,
        ...prev.graveyard.filter(c => isExtraDeckCardType(c.type)),
        ...prev.banished.filter(c => isExtraDeckCardType(c.type)),
      ];

      return {
        ...INITIAL_FIELD_STATE,
        deck: shuffleArray([...prev.deck, ...mainDeckCards]),
        extraDeck: extraDeckCards,
        sideDeck: prev.sideDeck,
      };
    });
  }, []);

  const getOccupiedZones = useCallback((): FieldZoneType[] => {
    const zones: FieldZoneType[] = [
      'monster1', 'monster2', 'monster3', 'monster4', 'monster5',
      'spell1', 'spell2', 'spell3', 'spell4', 'spell5',
      'extraMonster1', 'extraMonster2', 'fieldSpell'
    ];
    return zones.filter(zone => fieldState[zone] !== null);
  }, [fieldState]);

  const hasXYZOnField = useCallback((): boolean => {
    const monsterZones: FieldZoneType[] = ['monster1', 'monster2', 'monster3', 'monster4', 'monster5', 'extraMonster1', 'extraMonster2'];
    return monsterZones.some(zone => {
      const card = fieldState[zone];
      return card && !Array.isArray(card) && card.type && card.type.includes('XYZ');
    });
  }, [fieldState]);

  const handlePlaceCard = useCallback((zone: FieldZoneType, faceDown: boolean, position: 'attack' | 'defense') => {
    const card = placementModal.card;
    if (!card) return;

    setFieldState(prev => {
      // Remove from hand
      const handIndex = prev.hand.findIndex(c => c.instanceId === card.instanceId);
      if (handIndex === -1) return prev;

      const newHand = [...prev.hand];
      newHand.splice(handIndex, 1);

      const placedCard: GameCard = {
        ...card,
        isFaceDown: faceDown,
        position: position,
      };

      return {
        ...prev,
        hand: newHand,
        [zone]: placedCard,
      };
    });

    setPlacementModal({ open: false, card: null });
  }, [placementModal.card]);

  const handleZoneClick = useCallback((zone: FieldZoneType) => {
    // Open zone viewer for pile zones
    if (['graveyard', 'banished', 'extraDeck', 'deck', 'sideDeck'].includes(zone)) {
      setViewerModal({ open: true, zone });
    }
  }, []);

  const handleCardOnFieldClick = useCallback((card: GameCard, zone: FieldZoneType) => {
    if (attachMode) {
      const cardToAttach = attachMode.cardToAttach;
      const targetCard = fieldState[zone as keyof FieldState];
      
      // Check if target is an XYZ monster
      const isTargetXYZ = targetCard && !Array.isArray(targetCard) && targetCard.type && targetCard.type.includes('XYZ');
      
      if (!isTargetXYZ) {
        // Cancel attach mode if not XYZ
        setAttachMode(null);
        setCardActionsModal({ open: true, card, zone });
        return;
      }
      
      setFieldState(prev => {
        const currentTarget = prev[zone as keyof FieldState];
        if (!currentTarget || Array.isArray(currentTarget)) return prev;

        // Add the card as material
        const updatedTarget: GameCard = {
          ...(currentTarget as GameCard),
          attachedCards: [...((currentTarget as GameCard).attachedCards || []), cardToAttach]
        };

        return {
          ...prev,
          [zone]: updatedTarget,
        } as FieldState;
      });
      setAttachMode(null);
      return;
    }
    
    setCardActionsModal({ open: true, card, zone });
  }, [attachMode]);

  const handleCardDrop = useCallback((zone: FieldZoneType, card: GameCard & { sourceZone?: FieldZoneType }) => {
    // Handle dropped card from drag and drop
    setFieldState(prev => {
      const sourceZone = card.sourceZone;
      let newState = { ...prev };

      // Remove from source zone
      if (sourceZone) {
        // Remove sourceZone from card data
        const cleanCard = { ...card };
        delete (cleanCard as any).sourceZone;

        // Check if source is a single-card zone
        const singleCardZones = ['monster1', 'monster2', 'monster3', 'monster4', 'monster5',
          'spell1', 'spell2', 'spell3', 'spell4', 'spell5',
          'extraMonster1', 'extraMonster2', 'fieldSpell'] as const;

        if (singleCardZones.includes(sourceZone as any)) {
          newState[sourceZone] = null;
        } else if (['graveyard', 'banished', 'deck', 'extraDeck', 'sideDeck'].includes(sourceZone)) {
          const sourceArray = [...(newState[sourceZone as keyof FieldState] as GameCard[])];
          const idx = sourceArray.findIndex(c => c.instanceId === cleanCard.instanceId);
          if (idx !== -1) {
            sourceArray.splice(idx, 1);
            (newState as any)[sourceZone] = sourceArray;
          }
        }
      }

      // Remove from hand if present
      const handIndex = newState.hand.findIndex(c => c.instanceId === card.instanceId);
      if (handIndex !== -1) {
        const newHand = [...newState.hand];
        newHand.splice(handIndex, 1);
        newState.hand = newHand;
      }

      // Clean card data before placing
      const placedCard = { ...card, isFaceDown: false, attachedCards: undefined };
      delete (placedCard as any).sourceZone;
      
      // Place in target zone
      if (zone === 'graveyard') {
        newState.graveyard = [...newState.graveyard, placedCard];
      } else if (zone === 'banished') {
        newState.banished = [...newState.banished, placedCard];
      } else if (zone === 'deck') {
        newState.deck = [...newState.deck, placedCard];
      } else if (zone === 'sideDeck') {
        newState.sideDeck = [...newState.sideDeck, placedCard];
      } else if (zone === 'extraDeck') {
        newState.extraDeck = [...newState.extraDeck, placedCard];
      } else {
        // Single card zone - check if occupied
        if (newState[zone] !== null) {
          return prev; // Zone occupied, don't drop
        }
        (newState as any)[zone] = { ...placedCard, position: 'attack' };
      }

      return newState;
    });
  }, []);

  // Handle drop on hand zone
  const handleHandDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const cardData = e.dataTransfer.getData('application/json');
    if (!cardData) return;

    try {
      const card = JSON.parse(cardData) as GameCard & { sourceZone?: FieldZoneType };
      
      // Prevent duplicating if already in hand (dragging from hand to hand)
      if ((card as any).sourceZone === 'hand') {
        return;
      }
      
      setFieldState(prev => {
        const sourceZone = card.sourceZone;
        let newState = { ...prev };

        // Remove from source zone
        if (sourceZone) {
          const singleCardZones = ['monster1', 'monster2', 'monster3', 'monster4', 'monster5',
            'spell1', 'spell2', 'spell3', 'spell4', 'spell5',
            'extraMonster1', 'extraMonster2', 'fieldSpell'] as const;

          if (singleCardZones.includes(sourceZone as any)) {
            // Send materials to GY
            const fieldCard = newState[sourceZone] as GameCard;
            if (fieldCard?.attachedCards) {
              newState.graveyard = [...newState.graveyard, ...fieldCard.attachedCards];
            }
            newState[sourceZone] = null;
          } else if (['graveyard', 'banished', 'deck', 'extraDeck', 'sideDeck'].includes(sourceZone)) {
            const sourceArray = [...(newState[sourceZone as keyof FieldState] as GameCard[])];
            const idx = sourceArray.findIndex(c => c.instanceId === card.instanceId);
            if (idx !== -1) {
              sourceArray.splice(idx, 1);
              (newState as any)[sourceZone] = sourceArray;
            }
          }
        }

        // Add to hand
        const cleanCard = { ...card, isFaceDown: false, attachedCards: undefined };
        delete (cleanCard as any).sourceZone;
        newState.hand = [...newState.hand, cleanCard];

        return newState;
      });
    } catch (err) {
      console.error('Failed to parse dropped card:', err);
    }
  }, []);

  const handleHandCardClick = useCallback((card: GameCard) => {
    // Click always shows the effect modal
    setSelectedEffectCard(card);
    setEffectModalOpen(true);
  }, []);

  const searchCardInDeck = useCallback((cardName: string) => {
    if (!cardName.trim()) return;
    
    setFieldState(prev => {
      const lowerQuery = cardName.toLowerCase();
      const cardIndex = prev.deck.findIndex(c => 
        c.name.toLowerCase().includes(lowerQuery)
      );
      
      if (cardIndex === -1) return prev;
      
      const newDeck = [...prev.deck];
      const [foundCard] = newDeck.splice(cardIndex, 1);
      
      return {
        ...prev,
        deck: newDeck,
        hand: [...prev.hand, { ...foundCard, isFaceDown: false }],
      };
    });
    setSearchQuery('');
    setShowSearch(false);
  }, []);

  // Card actions from modal
  const handleFieldCardAction = useCallback((action: string) => {
    const { card, zone } = cardActionsModal;
    if (!card || !zone) return;

    const singleCardZones = ['monster1', 'monster2', 'monster3', 'monster4', 'monster5',
      'spell1', 'spell2', 'spell3', 'spell4', 'spell5',
      'extraMonster1', 'extraMonster2', 'fieldSpell'] as const;

    setFieldState(prev => {
      const currentCard = prev[zone as keyof FieldState];
      if (!currentCard || Array.isArray(currentCard)) return prev;

      let updates: Partial<FieldState> = {};
      
      switch (action) {
        case 'flipUp':
          updates = { [zone]: { ...(currentCard as GameCard), isFaceDown: false } };
          break;
        case 'flipDown':
          updates = { [zone]: { ...(currentCard as GameCard), isFaceDown: true } };
          break;
        case 'togglePosition': {
          const gc = currentCard as GameCard;
          updates = { 
            [zone]: { ...gc, position: gc.position === 'attack' ? 'defense' : 'attack' }
          };
          break;
        }
        case 'toGraveyard': {
          const materials = card.attachedCards || [];
          updates = { 
            [zone]: null, 
            graveyard: [...prev.graveyard, { ...card, isFaceDown: false, attachedCards: undefined }, ...materials]
          };
          break;
        }
        case 'toBanished': {
          const materials = card.attachedCards || [];
          updates = { 
            [zone]: null, 
            banished: [...prev.banished, { ...card, isFaceDown: false, attachedCards: undefined }],
            graveyard: [...prev.graveyard, ...materials]
          };
          break;
        }
        case 'toHand': {
          const materials = card.attachedCards || [];
          updates = { 
            [zone]: null, 
            hand: [...prev.hand, { ...card, isFaceDown: false, attachedCards: undefined }],
            graveyard: [...prev.graveyard, ...materials]
          };
          break;
        }
        case 'toTopDeck': {
          const materials = card.attachedCards || [];
          updates = { 
            [zone]: null, 
            deck: [{ ...card, isFaceDown: false, attachedCards: undefined }, ...prev.deck],
            graveyard: [...prev.graveyard, ...materials]
          };
          break;
        }
        case 'toBottomDeck': {
          const materials = card.attachedCards || [];
          updates = { 
            [zone]: null, 
            deck: [...prev.deck, { ...card, isFaceDown: false, attachedCards: undefined }],
            graveyard: [...prev.graveyard, ...materials]
          };
          break;
        }
        case 'shuffleIntoDeck': {
          const materials = card.attachedCards || [];
          updates = { 
            [zone]: null, 
            deck: shuffleArray([...prev.deck, { ...card, isFaceDown: false, attachedCards: undefined }]),
            graveyard: [...prev.graveyard, ...materials]
          };
          break;
        }
        case 'toExtraDeck': {
          const materials = card.attachedCards || [];
          updates = { 
            [zone]: null, 
            extraDeck: [...prev.extraDeck, { ...card, isFaceDown: false, attachedCards: undefined }],
            graveyard: [...prev.graveyard, ...materials]
          };
          break;
        }
      }
      
      return { ...prev, ...updates } as FieldState;
    });
    
    setCardActionsModal({ open: false, card: null, zone: null });
  }, [cardActionsModal]);

  // Ref to track if detach is in progress to prevent double-clicks
  const isDetachingRef = useRef(false);

  const handleDetachMaterial = useCallback((materialIndex: number) => {
    // Prevent double-click processing
    if (isDetachingRef.current) return;
    
    const { card, zone } = cardActionsModal;
    if (!card || !zone || !card.attachedCards) return;

    // Validate index before proceeding
    if (materialIndex < 0 || materialIndex >= card.attachedCards.length) return;

    // Set flag to prevent additional clicks
    isDetachingRef.current = true;

    // Close the modal immediately
    setCardActionsModal({ open: false, card: null, zone: null });

    setFieldState(prev => {
      const currentCard = prev[zone] as GameCard;
      if (!currentCard?.attachedCards) return prev;
      
      // Double-check index is still valid in current state
      if (materialIndex >= currentCard.attachedCards.length) {
        isDetachingRef.current = false;
        return prev;
      }

      const newMaterials = [...currentCard.attachedCards];
      const detachedResult = newMaterials.splice(materialIndex, 1);
      
      // Ensure we actually detached something
      if (detachedResult.length === 0) {
        isDetachingRef.current = false;
        return prev;
      }
      
      const detached = detachedResult[0];

      // Reset flag after successful operation
      setTimeout(() => {
        isDetachingRef.current = false;
      }, 100);

      return {
        ...prev,
        [zone]: { ...currentCard, attachedCards: newMaterials },
        graveyard: [...prev.graveyard, detached],
      };
    });
  }, [cardActionsModal]);

  const handleZoneViewerAction = useCallback((action: string, card: GameCard, index: number) => {
    const zone = viewerModal.zone;
    if (!zone) return;

    setFieldState(prev => {
      const newState = { ...prev };
      const sourceArray = [...(prev[zone as keyof FieldState] as GameCard[])];
      sourceArray.splice(index, 1);
      newState[zone as keyof FieldState] = sourceArray as any;

      // Use the updated sourceArray if moving within the same zone (deck)
      const currentDeck = zone === 'deck' ? sourceArray : prev.deck;

      switch (action) {
        case 'toHand':
          newState.hand = [...prev.hand, { ...card, isFaceDown: false }];
          break;
        case 'toGY':
          newState.graveyard = zone === 'graveyard' ? sourceArray : [...prev.graveyard, card];
          break;
        case 'toBanished':
          newState.banished = zone === 'banished' ? sourceArray : [...prev.banished, card];
          break;
        case 'toTop':
          newState.deck = [card, ...currentDeck];
          break;
        case 'toBottom':
          newState.deck = [...currentDeck, card];
          break;
        case 'toField': {
          const result = findPriorityZone(card, zone as CardSourceZone, getOccupiedZones());
          if (result.zone) {
            (newState as any)[result.zone] = { 
              ...card, 
              isFaceDown: result.faceDown, 
              position: result.faceDown ? 'attack' : 'attack' 
            };
          }
          break;
        }
      }

      return newState;
    });
  }, [viewerModal.zone, getOccupiedZones]);

  // Calculate total cards
  const totalMainDeck = deck.reduce((acc, c) => acc + c.quantity, 0);
  const totalExtraDeck = extraDeck.reduce((acc, c) => acc + c.quantity, 0);
  const hasDeck = totalMainDeck > 0 || totalExtraDeck > 0;

  if (!isOpen) return null;

  const containerStyle = isFullscreen 
    ? {} 
    : isMinimized 
      ? { left: position.x, top: position.y } 
      : { left: position.x, top: position.y };

  const containerClasses = isFullscreen
    ? "fixed inset-4 z-50 bg-card/98 backdrop-blur-md border border-border rounded-xl shadow-2xl flex flex-col"
    : cn(
        "fixed z-40 bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-2xl transition-all duration-300",
        isMinimized 
          ? "w-12 h-12" 
          : "w-[420px] sm:w-[500px] max-w-[95vw] h-[700px] max-h-[90vh]",
        isDragging && "cursor-grabbing"
      );

  return (
    <>
      <div 
        ref={elementRef}
        className={containerClasses}
        style={containerStyle}
      >
        {isMinimized ? (
          <button
            onClick={() => setIsMinimized(false)}
            className="w-full h-full flex items-center justify-center hover:bg-muted/50 rounded-lg"
          >
            <Layers className="h-6 w-6 text-primary" />
          </button>
        ) : (
          <div className="flex flex-col h-full">
            {/* Draggable Header */}
            <div 
              className={cn(
                "flex items-center justify-between p-2 border-b border-border flex-shrink-0",
                !isFullscreen && "cursor-grab hover:bg-muted/30"
              )}
              {...(!isFullscreen ? dragHandlers : {})}
            >
              <div className="flex items-center gap-2">
                {!isFullscreen && <Move className="h-3 w-3 text-muted-foreground" />}
                <Layers className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm">Arena Digital</span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-6 px-2 text-xs gap-1"
                  onClick={onClose}
                >
                  <X className="h-3 w-3" />
                  Sair
                </Button>
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
              </div>
            </div>

            {/* Attach mode banner */}
            {attachMode && (
              <div className="bg-blue-500/20 border-b border-blue-500 p-2 flex items-center justify-between flex-shrink-0">
                <span className="text-xs text-blue-600">
                  Anexar "{attachMode.cardToAttach?.name}" como material - clique em um monstro XYZ
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
                  {/* Deck Controls */}
                  <div className="flex items-center justify-between gap-1 flex-wrap p-2 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-1 flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        Deck: {fieldState.deck.length}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        Extra: {fieldState.extraDeck.length}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        Mão: {fieldState.hand.length}
                      </Badge>
                      {fieldState.sideDeck.length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          Side: {fieldState.sideDeck.length}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {fieldState.sideDeck.length > 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => setShowSideSwap(true)}
                          title="Trocar Side Deck"
                        >
                          <ArrowLeftRight className="h-3 w-3" />
                        </Button>
                      )}
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
                      disabled={fieldState.deck.length === 0}
                    >
                      Comprar 1
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 h-7 text-xs"
                      onClick={() => drawMultiple(5)}
                      disabled={fieldState.deck.length === 0}
                    >
                      Comprar 5
                    </Button>
                  </div>

                  {/* Hand Zone - Droppable */}
                  <div 
                    className="border rounded-lg p-2 bg-muted/20 transition-colors"
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.add('border-primary', 'bg-primary/10');
                    }}
                    onDragLeave={(e) => {
                      e.currentTarget.classList.remove('border-primary', 'bg-primary/10');
                    }}
                    onDrop={(e) => {
                      e.currentTarget.classList.remove('border-primary', 'bg-primary/10');
                      handleHandDrop(e);
                    }}
                  >
                    <div className="flex items-center gap-1 mb-2">
                      <Hand className="h-3 w-3 text-green-500" />
                      <span className="text-xs font-medium">Mão</span>
                      <span className="text-[9px] text-muted-foreground ml-1">(arraste cartas aqui)</span>
                      <Badge variant="secondary" className="text-[10px] h-4 px-1 ml-auto">
                        {fieldState.hand.length}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1 min-h-[60px]">
                      {fieldState.hand.map((card) => (
                        <div
                          key={card.instanceId}
                          className="relative group cursor-grab active:cursor-grabbing"
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('application/json', JSON.stringify({ ...card, sourceZone: 'hand' }));
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onClick={() => handleHandCardClick(card)}
                        >
                          <div className="absolute top-0 left-0 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                            <GripVertical className="h-3 w-3 text-white drop-shadow-lg" />
                          </div>
                          <img
                            src={card.card_images?.[0]?.image_url_small}
                            alt={card.name}
                            className="h-16 sm:h-20 w-auto rounded-sm shadow-sm hover:shadow-lg transition-all hover:scale-105"
                            title={card.name}
                          />
                        </div>
                      ))}
                      {fieldState.hand.length === 0 && (
                        <p className="text-xs text-muted-foreground w-full text-center py-4">
                          Arraste cartas do campo ou clique em "Comprar"
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Field Board */}
                  <DuelFieldBoard
                    fieldState={fieldState}
                    onZoneClick={handleZoneClick}
                    onCardClick={handleCardOnFieldClick}
                    onCardDrop={handleCardDrop}
                    isFullscreen={isFullscreen}
                  />
                </div>
              </ScrollArea>
            )}
          </div>
        )}
      </div>

      {/* Placement Modal */}
      <ZonePlacementModal
        open={placementModal.open}
        onClose={() => setPlacementModal({ open: false, card: null })}
        card={placementModal.card}
        onPlaceCard={handlePlaceCard}
        occupiedZones={getOccupiedZones()}
      />

      {/* Zone Viewer Modal */}
      <ZoneViewerModal
        open={viewerModal.open}
        onClose={() => setViewerModal({ open: false, zone: null })}
        zone={viewerModal.zone}
        cards={
          viewerModal.zone 
            ? (fieldState[viewerModal.zone as keyof FieldState] as GameCard[]) || []
            : []
        }
        onCardClick={(card, idx) => handleZoneViewerAction('toHand', card, idx)}
        onAddToHand={(card, idx) => handleZoneViewerAction('toHand', card, idx)}
        onSendToGY={(card, idx) => handleZoneViewerAction('toGY', card, idx)}
        onSendToBanished={(card, idx) => handleZoneViewerAction('toBanished', card, idx)}
        onReturnToTop={viewerModal.zone === 'deck' ? (card, idx) => handleZoneViewerAction('toTop', card, idx) : undefined}
        onReturnToBottom={viewerModal.zone === 'deck' ? (card, idx) => handleZoneViewerAction('toBottom', card, idx) : undefined}
        onShuffle={viewerModal.zone === 'deck' ? shuffleDeck : undefined}
        onDraw={viewerModal.zone === 'deck' ? drawCard : undefined}
        onInvokeToField={(card, idx) => handleZoneViewerAction('toField', card, idx)}
        hasXYZMonster={hasXYZOnField()}
        onAttachAsMaterial={(card, idx) => {
          // Store the card to attach and close modal - user will click on XYZ to attach
          setAttachMode({ targetZone: 'monster1' as FieldZoneType, cardToAttach: card });
          setViewerModal({ open: false, zone: null });
        }}
        isDeck={viewerModal.zone === 'deck'}
      />

      {/* Field Card Actions Modal */}
      <FieldCardActionsModal
        open={cardActionsModal.open}
        onClose={() => setCardActionsModal({ open: false, card: null, zone: null })}
        card={cardActionsModal.card}
        zone={cardActionsModal.zone}
        onFlipFaceUp={() => handleFieldCardAction('flipUp')}
        onFlipFaceDown={() => handleFieldCardAction('flipDown')}
        onTogglePosition={() => handleFieldCardAction('togglePosition')}
        onSendToGraveyard={() => handleFieldCardAction('toGraveyard')}
        onSendToBanished={() => handleFieldCardAction('toBanished')}
        onReturnToHand={() => handleFieldCardAction('toHand')}
        onReturnToTopOfDeck={() => handleFieldCardAction('toTopDeck')}
        onReturnToBottomOfDeck={() => handleFieldCardAction('toBottomDeck')}
        onShuffleIntoDeck={() => handleFieldCardAction('shuffleIntoDeck')}
        onReturnToExtraDeck={() => handleFieldCardAction('toExtraDeck')}
        onAttachMaterial={() => {
          if (cardActionsModal.zone && cardActionsModal.card) {
            setAttachMode({ targetZone: cardActionsModal.zone, cardToAttach: cardActionsModal.card });
            setCardActionsModal({ open: false, card: null, zone: null });
          }
        }}
        onDetachMaterial={handleDetachMaterial}
        isExtraDeckCard={cardActionsModal.card ? isExtraDeckCardType(cardActionsModal.card.type) : false}
      />

      {/* Card Effect Modal for hand/field/opponent previews */}
      <CardEffectModal
        open={!!effectModalOpen}
        onClose={() => setEffectModalOpen(false)}
        card={selectedEffectCard}
        showPlaceButton={selectedEffectCard && fieldState.hand.some(c => c.instanceId === selectedEffectCard.instanceId)}
        onPlaceCard={() => {
          if (selectedEffectCard) {
            setPlacementModal({ open: true, card: selectedEffectCard });
            setEffectModalOpen(false);
          }
        }}
      />

      {/* Side Deck Swap Modal */}
      <SideDeckSwapModal
        open={showSideSwap}
        onClose={() => setShowSideSwap(false)}
        mainDeck={fieldState.deck}
        extraDeck={fieldState.extraDeck}
        sideDeck={fieldState.sideDeck}
        onSwapComplete={(newMainDeck, newExtraDeck, newSideDeck) => {
          setFieldState(prev => ({
            ...prev,
            deck: shuffleArray(newMainDeck),
            extraDeck: newExtraDeck,
            sideDeck: newSideDeck,
          }));
        }}
      />
    </>
  );
};
