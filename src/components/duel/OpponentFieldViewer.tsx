import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Layers, 
  Flame, 
  Ban, 
  Eye,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface OpponentCard {
  id: number;
  name: string;
  image: string;
}

interface OpponentState {
  hand: number;
  field: OpponentCard[];
  graveyard: OpponentCard[];
  banished: OpponentCard[];
  deckCount: number;
  extraCount: number;
}

interface OpponentFieldViewerProps {
  duelId: string;
  currentUserId: string;
  opponentUsername?: string;
}

export const OpponentFieldViewer = ({ 
  duelId, 
  currentUserId, 
  opponentUsername = 'Oponente' 
}: OpponentFieldViewerProps) => {
  const [opponentState, setOpponentState] = useState<OpponentState | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

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

  if (!opponentState) {
    return (
      <div className="bg-muted/30 rounded-lg p-3 text-center text-sm text-muted-foreground">
        <Eye className="h-4 w-4 inline mr-2" />
        Aguardando dados do oponente...
      </div>
    );
  }

  const ZoneDisplay = ({ 
    title, 
    cards, 
    icon: Icon, 
    color 
  }: { 
    title: string; 
    cards: OpponentCard[]; 
    icon: typeof Layers;
    color: string;
  }) => (
    <div className="space-y-1">
      <div className="flex items-center gap-1 text-xs font-medium">
        <Icon className={cn("h-3 w-3", color)} />
        {title}
        <Badge variant="secondary" className="text-[10px] h-4 px-1 ml-1">
          {cards.length}
        </Badge>
      </div>
      {cards.length > 0 && (
        <ScrollArea className="max-h-16">
          <div className="flex gap-1 flex-wrap">
            {cards.map((card, idx) => (
              <img
                key={`${card.id}-${idx}`}
                src={card.image}
                alt={card.name}
                title={card.name}
                className="w-8 h-auto rounded-sm shadow-sm"
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );

  return (
    <div className="bg-muted/30 rounded-lg border border-border/50 overflow-hidden">
      <div 
        className="flex items-center justify-between p-2 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Campo do {opponentUsername}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Mão: {opponentState.hand} | Deck: {opponentState.deckCount} | Extra: {opponentState.extraCount}
          </span>
          {isCollapsed ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-2 pt-0 space-y-2 border-t border-border/30">
          <ZoneDisplay title="Campo" cards={opponentState.field} icon={Layers} color="text-green-500" />
          <div className="grid grid-cols-2 gap-2">
            <ZoneDisplay title="Cemitério" cards={opponentState.graveyard} icon={Flame} color="text-orange-500" />
            <ZoneDisplay title="Banido" cards={opponentState.banished} icon={Ban} color="text-purple-500" />
          </div>
        </div>
      )}
    </div>
  );
};
