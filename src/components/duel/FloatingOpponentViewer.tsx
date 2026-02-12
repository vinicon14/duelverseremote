import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CardEffectModal } from '@/components/duel/CardEffectModal';
import { 
  Layers, 
  Flame, 
  Ban, 
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  X,
  Minimize2,
  Hand,
  Move,
  Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useDraggable } from '@/hooks/useDraggable';

interface OpponentCard {
  id: number;
  name: string;
  image: string;
  isFaceDown?: boolean;
  materials?: number;
  position?: string;
}

interface ZoneCards {
  monster1: OpponentCard | null;
  monster2: OpponentCard | null;
  monster3: OpponentCard | null;
  monster4: OpponentCard | null;
  monster5: OpponentCard | null;
}

interface SpellZoneCards {
  spell1: OpponentCard | null;
  spell2: OpponentCard | null;
  spell3: OpponentCard | null;
  spell4: OpponentCard | null;
  spell5: OpponentCard | null;
}

interface ExtraMonsterZones {
  extraMonster1: OpponentCard | null;
  extraMonster2: OpponentCard | null;
}

interface OpponentState {
  hand: number;
  field: OpponentCard[];
  monsterZones?: ZoneCards;
  spellZones?: SpellZoneCards;
  extraMonsterZones?: ExtraMonsterZones;
  fieldSpell?: OpponentCard | null;
  graveyard: OpponentCard[];
  banished: OpponentCard[];
  deckCount: number;
  extraCount: number;
}

interface FloatingOpponentViewerProps {
  duelId: string;
  currentUserId: string;
  opponentUsername?: string;
}

const CARD_BACK_URL = 'https://images.ygoprodeck.com/images/cards/back_high.jpg';

export const FloatingOpponentViewer = ({ 
  duelId, 
  currentUserId, 
  opponentUsername = 'Oponente' 
}: FloatingOpponentViewerProps) => {
  const [opponentState, setOpponentState] = useState<OpponentState | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true);
  const [isVisible, setIsVisible] = useState(true);
  const [selectedCard, setSelectedCard] = useState<OpponentCard | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const { position, isDragging, elementRef, dragHandlers } = useDraggable({
    initialPosition: { x: 8, y: 80 },
  });

  useEffect(() => {
    if (!duelId) return;

    const channel = supabase.channel(`deck-sync-${duelId}`);
    
    channel
      .on('broadcast', { event: 'deck-state' }, ({ payload }) => {
        console.log('[FloatingOpponentViewer] Received broadcast:', payload);
        // Only update if this is the opponent's state (not our own)
        if (payload.userId && payload.userId !== currentUserId) {
          console.log('[FloatingOpponentViewer] Updating opponent state with zones:', {
            monsterZones: payload.monsterZones,
            spellZones: payload.spellZones,
          });
          setOpponentState({
            hand: payload.hand || 0,
            field: payload.field || [],
            monsterZones: payload.monsterZones || undefined,
            spellZones: payload.spellZones || undefined,
            extraMonsterZones: payload.extraMonsterZones || undefined,
            fieldSpell: payload.fieldSpell || null,
            graveyard: payload.graveyard || [],
            banished: payload.banished || [],
            deckCount: payload.deckCount || 0,
            extraCount: payload.extraCount || 0,
          });
        }
      })
      .subscribe((status) => {
        console.log('[FloatingOpponentViewer] Channel subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [duelId, currentUserId]);

  if (!isVisible) {
    return (
      <Button
        variant="secondary"
        size="sm"
        className="fixed left-2 top-20 z-40 gap-2"
        onClick={() => setIsVisible(true)}
      >
        <Eye className="h-4 w-4" />
        Ver Deck Oponente
      </Button>
    );
  }

  if (isMinimized) {
    return (
      <div
        ref={elementRef}
        onClick={() => !isDragging && setIsMinimized(false)}
        className={cn(
          "fixed z-40 bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-lg flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors cursor-pointer",
          isDragging && "cursor-grabbing"
        )}
        style={{ left: position.x, top: position.y }}
        {...dragHandlers}
      >
        <Eye className="h-5 w-5 text-primary" />
        <span className="text-sm font-medium whitespace-nowrap">Ver deck do oponente</span>
      </div>
    );
  }

  const ZoneSlotDisplay = ({ card, label }: { card: OpponentCard | null; label: string }) => (
    <div className={cn(
      "w-8 h-12 border border-dashed border-muted-foreground/30 rounded flex items-center justify-center",
      card && "border-solid border-primary/30"
    )}>
      {card ? (
        <div className={cn(
          "relative w-full h-full",
          card.position?.toString().toLowerCase().startsWith('def') && "rotate-90"
        )}>
          <img
            src={card.image || CARD_BACK_URL}
            alt={card.name}
            title={card.isFaceDown ? 'Carta virada' : card.name}
            className={cn(
              "w-full h-full object-cover rounded"
            )}
          />
          {card.isFaceDown && (
            <div className="absolute top-0 right-0">
              <EyeOff className="h-2 w-2 text-red-500" />
            </div>
          )}
          {card.materials && card.materials > 0 && (
            <Badge className="absolute -bottom-1 -right-1 text-[6px] h-3 px-0.5 bg-yellow-600">
              {card.materials}
            </Badge>
          )}
        </div>
      ) : (
        <span className="text-[6px] text-muted-foreground/50">{label}</span>
      )}
    </div>
  );

  const ZoneDisplay = ({ 
    title, 
    cards, 
    icon: Icon, 
    color,
    compact = false
  }: { 
    title: string; 
    cards: OpponentCard[]; 
    icon: typeof Layers;
    color: string;
    compact?: boolean;
  }) => (
    <div className="space-y-1">
      <div className="flex items-center gap-1 text-xs font-medium">
        <Icon className={cn("h-3 w-3", color)} />
        <span className={compact ? "hidden sm:inline" : ""}>{title}</span>
        <Badge variant="secondary" className="text-[10px] h-4 px-1">
          {cards.length}
        </Badge>
      </div>
      {cards.length > 0 && !isCollapsed && (
        <ScrollArea className="max-h-20">
          <div className="flex gap-1 flex-wrap">
            {cards.map((card, idx) => (
                <div 
                key={`${card.id}-${idx}`} 
                className={cn(
                  "relative cursor-pointer hover:opacity-80 transition-opacity",
                  card.position?.toString().toLowerCase().startsWith('def') && "transform origin-center"
                )}
                onClick={() => {
                  setSelectedCard(card);
                  setModalOpen(true);
                }}
              >
                <img
                  src={card.isFaceDown ? CARD_BACK_URL : card.image}
                  alt={card.isFaceDown ? 'Face-down card' : card.name}
                  title={card.isFaceDown ? 'Carta virada' : card.name}
                  className={cn(
                    "w-10 h-auto rounded-sm shadow-sm hover:scale-110 transition-transform"
                  )}
                />
                {card.materials && card.materials > 0 && (
                  <Badge className="absolute -bottom-1 -right-1 text-[8px] h-3 px-1 bg-yellow-600">
                    {card.materials}
                  </Badge>
                )}
                {card.isFaceDown && (
                  <div className="absolute top-0 right-0">
                    <EyeOff className="h-2 w-2 text-red-500" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );

  return (
    <div 
      ref={elementRef}
      className={cn(
        "fixed z-40 w-80 sm:w-96 bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-2xl overflow-hidden",
        isDragging && "cursor-grabbing"
      )}
      style={{ left: position.x, top: position.y }}
    >
      {/* Draggable Header */}
      <div 
        className="flex items-center justify-between p-2 border-b border-border bg-muted/30 cursor-grab hover:bg-muted/50"
        {...dragHandlers}
      >
        <div className="flex items-center gap-2">
          <Move className="h-3 w-3 text-muted-foreground" />
          <Eye className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Deck de {opponentUsername}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setIsMinimized(true)}
          >
            <Minimize2 className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setIsVisible(false)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-2">
        {!opponentState ? (
          <div className="text-center text-sm text-muted-foreground py-4">
            <Eye className="h-6 w-6 mx-auto mb-2 opacity-50" />
            <p>Aguardando o oponente carregar o deck virtual...</p>
            <p className="text-xs mt-1">O oponente precisa abrir a Arena Digital</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Stats Bar */}
            <div className="flex items-center justify-between gap-2 p-2 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-1">
                <Hand className="h-3 w-3 text-blue-500" />
                <span className="text-xs">Mão: {opponentState.hand}</span>
              </div>
              <div className="flex items-center gap-1">
                <Layers className="h-3 w-3 text-gray-500" />
                <span className="text-xs">Deck: {opponentState.deckCount}</span>
              </div>
              <div className="flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-yellow-500" />
                <span className="text-xs">Extra: {opponentState.extraCount}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() => setIsCollapsed(!isCollapsed)}
              >
                {isCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
              </Button>
            </div>

            {!isCollapsed && (
              <>
                {/* Field Zones Layout */}
                {opponentState.monsterZones && (
                  <div className="space-y-2 p-2 bg-muted/20 rounded-lg">
                    <span className="text-[10px] font-medium text-muted-foreground">Zonas de Campo do Oponente</span>
                    
                    {/* Extra Monster Zones */}
                    {opponentState.extraMonsterZones && (
                      <div className="flex justify-center gap-8">
                        <ZoneSlotDisplay card={opponentState.extraMonsterZones.extraMonster1} label="EM1" />
                        <ZoneSlotDisplay card={opponentState.extraMonsterZones.extraMonster2} label="EM2" />
                      </div>
                    )}

                    {/* Monster Zones */}
                    <div className="flex justify-center gap-1">
                      <ZoneSlotDisplay card={opponentState.monsterZones.monster1} label="M1" />
                      <ZoneSlotDisplay card={opponentState.monsterZones.monster2} label="M2" />
                      <ZoneSlotDisplay card={opponentState.monsterZones.monster3} label="M3" />
                      <ZoneSlotDisplay card={opponentState.monsterZones.monster4} label="M4" />
                      <ZoneSlotDisplay card={opponentState.monsterZones.monster5} label="M5" />
                    </div>

                    {/* Spell/Trap Zones */}
                    {opponentState.spellZones && (
                      <div className="flex justify-center gap-1">
                        <ZoneSlotDisplay card={opponentState.spellZones.spell1} label="S1" />
                        <ZoneSlotDisplay card={opponentState.spellZones.spell2} label="S2" />
                        <ZoneSlotDisplay card={opponentState.spellZones.spell3} label="S3" />
                        <ZoneSlotDisplay card={opponentState.spellZones.spell4} label="S4" />
                        <ZoneSlotDisplay card={opponentState.spellZones.spell5} label="S5" />
                      </div>
                    )}

                    {/* Field Spell Zone */}
                    {opponentState.fieldSpell && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">Campo:</span>
                        <ZoneSlotDisplay card={opponentState.fieldSpell} label="FS" />
                      </div>
                    )}
                  </div>
                )}

                {/* Fallback to old field display if no zone data */}
                {!opponentState.monsterZones && opponentState.field.length > 0 && (
                  <ZoneDisplay 
                    title="Campo" 
                    cards={opponentState.field} 
                    icon={Layers} 
                    color="text-green-500" 
                  />
                )}

                {/* Graveyard & Banished */}
                <div className="grid grid-cols-2 gap-2">
                  <ZoneDisplay 
                    title="Cemitério" 
                    cards={opponentState.graveyard} 
                    icon={Flame} 
                    color="text-orange-500"
                    compact 
                  />
                  <ZoneDisplay 
                    title="Banido" 
                    cards={opponentState.banished} 
                    icon={Ban} 
                    color="text-purple-500"
                    compact 
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Card effect modal for opponent previews */}
      <CardEffectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        card={selectedCard ? {
          name: selectedCard.name,
          type: '',
          desc: '',
          race: '',
          card_images: [{ image_url_small: selectedCard.image }]
        } : null}
      />
    </div>
  );
};
