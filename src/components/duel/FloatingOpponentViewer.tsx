import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  Maximize2,
  Hand
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface OpponentCard {
  id: number;
  name: string;
  image: string;
  isFaceDown?: boolean;
  materials?: number;
}

interface OpponentState {
  hand: number;
  field: OpponentCard[];
  fieldZone?: OpponentCard[];
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
  const [isMinimized, setIsMinimized] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (!duelId) return;

    const channel = supabase.channel(`deck-sync-${duelId}`);
    
    channel
      .on('broadcast', { event: 'deck-state' }, ({ payload }) => {
        // Only update if this is the opponent's state (not our own)
        if (payload.userId && payload.userId !== currentUserId) {
          setOpponentState({
            hand: payload.hand || 0,
            field: payload.field || [],
            fieldZone: payload.fieldZone || [],
            graveyard: payload.graveyard || [],
            banished: payload.banished || [],
            deckCount: payload.deckCount || 0,
            extraCount: payload.extraCount || 0,
          });
        }
      })
      .subscribe();

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
      <button
        onClick={() => setIsMinimized(false)}
        className="fixed left-2 top-20 z-40 w-10 h-10 bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-lg flex items-center justify-center hover:bg-muted/50 transition-colors"
      >
        <Eye className="h-5 w-5 text-primary" />
      </button>
    );
  }

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
              <div key={`${card.id}-${idx}`} className="relative">
                <img
                  src={card.isFaceDown ? CARD_BACK_URL : card.image}
                  alt={card.isFaceDown ? 'Face-down card' : card.name}
                  title={card.isFaceDown ? 'Carta virada' : card.name}
                  className="w-10 h-auto rounded-sm shadow-sm hover:scale-110 transition-transform"
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
    <div className="fixed left-2 top-20 z-40 w-72 sm:w-80 bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
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
            <p className="text-xs mt-1">O oponente precisa abrir o Duelingbook</p>
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
                <Layers className="h-3 w-3 text-yellow-500" />
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

            {/* Field */}
            <ZoneDisplay 
              title="Campo" 
              cards={opponentState.field} 
              icon={Layers} 
              color="text-green-500" 
            />

            {/* Field Zone */}
            {opponentState.fieldZone && opponentState.fieldZone.length > 0 && (
              <ZoneDisplay 
                title="Zona de Campo" 
                cards={opponentState.fieldZone} 
                icon={Layers} 
                color="text-emerald-500" 
              />
            )}

            {/* Graveyard & Banished */}
            {!isCollapsed && (
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
            )}
          </div>
        )}
      </div>
    </div>
  );
};
