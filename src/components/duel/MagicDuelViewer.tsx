/**
 * DuelVerse - Magic Duel Deck Viewer
 * 
 * Viewer integrado para a arena de Magic, permitindo gerenciar deck e campo.
 */
import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { MagicFieldBoard, MagicFieldState, MagicZoneType, MagicCard, MagicPhase } from './MagicFieldBoard';

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
}

export const MagicDuelViewer = ({ isOpen, onClose, duelId, currentUserId }: MagicDuelViewerProps) => {
  const [fieldState, setFieldState] = useState<MagicFieldState>(createInitialFieldState);
  const [currentPhase, setCurrentPhase] = useState<MagicPhase>('untap');
  const [deckLoaded, setDeckLoaded] = useState(false);

  // Load last saved Magic deck
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
          
          // Convert saved deck cards to MagicCard format for library
          const libraryCards: MagicCard[] = mainCards.flatMap((card: any) => {
            const copies: MagicCard[] = [];
            for (let i = 0; i < (card.quantity || 1); i++) {
              copies.push({
                id: card.id || card.name,
                name: card.name,
                type_line: card.type_line || '',
                oracle_text: card.oracle_text || '',
                mana_cost: card.mana_cost || '',
                power: card.power,
                toughness: card.toughness,
                image_uris: card.image_uris,
                card_faces: card.card_faces,
                instanceId: `${card.id}-${i}-${Date.now()}-${Math.random()}`,
                isTapped: false,
                isFaceDown: false,
              });
            }
            return copies;
          });

          // Shuffle library
          for (let i = libraryCards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [libraryCards[i], libraryCards[j]] = [libraryCards[j], libraryCards[i]];
          }

          setFieldState(prev => ({
            ...prev,
            library: libraryCards,
          }));
          setDeckLoaded(true);
        }
      } catch (err) {
        console.error('Error loading Magic deck:', err);
      }
    };

    loadDeck();
  }, [currentUserId, deckLoaded]);

  // Draw a card
  const drawCard = useCallback(() => {
    setFieldState(prev => {
      if (prev.library.length === 0) return prev;
      const [drawn, ...rest] = prev.library;
      return { ...prev, library: rest, hand: [...prev.hand, drawn] };
    });
  }, []);

  // Draw initial hand (7 cards)
  const drawInitialHand = useCallback(() => {
    setFieldState(prev => {
      const handSize = 7;
      const drawn = prev.library.slice(0, handSize);
      const rest = prev.library.slice(handSize);
      return { ...prev, library: rest, hand: [...prev.hand, ...drawn] };
    });
  }, []);

  // Shuffle library
  const shuffleLibrary = useCallback(() => {
    setFieldState(prev => {
      const shuffled = [...prev.library];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return { ...prev, library: shuffled };
    });
  }, []);

  // Untap all
  const untapAll = useCallback(() => {
    setFieldState(prev => ({
      ...prev,
      battlefield: prev.battlefield.map(c => ({ ...c, isTapped: false })),
      lands: prev.lands.map(c => ({ ...c, isTapped: false })),
    }));
  }, []);

  // Move card between zones
  const handleCardDrop = useCallback((targetZone: MagicZoneType, card: MagicCard) => {
    setFieldState(prev => {
      const newState = { ...prev };
      
      // Remove card from all zones
      for (const zone of Object.keys(newState) as MagicZoneType[]) {
        if (Array.isArray(newState[zone])) {
          (newState[zone] as MagicCard[]) = (newState[zone] as MagicCard[]).filter(
            c => c.instanceId !== card.instanceId
          );
        }
      }

      // Add to target zone
      const targetCards = [...(newState[targetZone] as MagicCard[])];
      const movedCard = { ...card };
      
      // Auto-untap when moving to hand or library
      if (targetZone === 'hand' || targetZone === 'library') {
        movedCard.isTapped = false;
      }
      
      targetCards.push(movedCard);
      (newState[targetZone] as MagicCard[]) = targetCards;

      return { ...newState };
    });
  }, []);

  const handleTapCard = useCallback((card: MagicCard) => {
    setFieldState(prev => {
      const tapInZone = (cards: MagicCard[]) =>
        cards.map(c => c.instanceId === card.instanceId ? { ...c, isTapped: !c.isTapped } : c);
      return {
        ...prev,
        battlefield: tapInZone(prev.battlefield),
        lands: tapInZone(prev.lands),
      };
    });
  }, []);

  const handleCardClick = useCallback((card: MagicCard, zone: MagicZoneType) => {
    // For now just log; could open a detail modal
    console.log('Card clicked:', card.name, 'in', zone);
  }, []);

  const handleZoneClick = useCallback((zone: MagicZoneType) => {
    console.log('Zone clicked:', zone);
  }, []);

  // Sync field state to Supabase for opponent viewer
  useEffect(() => {
    if (!duelId || !currentUserId) return;

    const channel = supabase.channel(`magic-deck-sync-${duelId}-${currentUserId}`);
    
    channel.send({
      type: 'broadcast',
      event: 'magic-field-update',
      payload: {
        userId: currentUserId,
        fieldState: {
          battlefield: fieldState.battlefield.length,
          lands: fieldState.lands.length,
          hand: fieldState.hand.length,
          library: fieldState.library.length,
          graveyard: fieldState.graveyard.length,
          exile: fieldState.exile.length,
          stack: fieldState.stack.length,
        },
        phase: currentPhase,
      },
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fieldState, currentPhase, duelId, currentUserId]);

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="h-[85vh] sm:h-[80vh] p-2 sm:p-4">
        <SheetHeader className="pb-2">
          <SheetTitle className="flex items-center justify-between text-sm">
            <span>Arena Magic</span>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={drawInitialHand}>
                Mão Inicial (7)
              </Button>
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={drawCard}>
                Comprar
              </Button>
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={shuffleLibrary}>
                Embaralhar
              </Button>
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={untapAll}>
                Untap All
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
          />
        </div>
      </SheetContent>
    </Sheet>
  );
};
