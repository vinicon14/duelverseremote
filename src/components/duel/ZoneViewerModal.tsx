import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { 
  Layers, 
  Flame, 
  Ban, 
  Sparkles, 
  Hand,
  ArrowUp,
  ArrowDown,
  Shuffle,
  Eye,
  Trash2
} from 'lucide-react';
import { FieldZoneType, GameCard } from './DuelFieldBoard';

interface ZoneViewerModalProps {
  open: boolean;
  onClose: () => void;
  zone: FieldZoneType | 'hand' | null;
  cards: GameCard[];
  onCardClick: (card: GameCard, index: number) => void;
  onAddToHand?: (card: GameCard, index: number) => void;
  onSendToGY?: (card: GameCard, index: number) => void;
  onSendToBanished?: (card: GameCard, index: number) => void;
  onReturnToTop?: (card: GameCard, index: number) => void;
  onReturnToBottom?: (card: GameCard, index: number) => void;
  onShuffleIn?: (card: GameCard, index: number) => void;
  onShuffle?: () => void;
  onDraw?: () => void;
  onInvokeToField?: (card: GameCard, index: number) => void;
  hasXYZMonster?: boolean;
  onAttachAsMaterial?: (card: GameCard, index: number) => void;
  isDeck?: boolean;
}

const getZoneInfo = (zone: FieldZoneType | 'hand' | null) => {
  switch (zone) {
    case 'graveyard':
      return { title: 'Cemitério', icon: Flame, color: 'text-orange-500' };
    case 'banished':
      return { title: 'Banidos', icon: Ban, color: 'text-purple-500' };
    case 'extraDeck':
      return { title: 'Extra Deck', icon: Sparkles, color: 'text-yellow-500' };
    case 'deck':
      return { title: 'Deck Principal', icon: Layers, color: 'text-blue-500' };
    case 'sideDeck':
      return { title: 'Side Deck', icon: Layers, color: 'text-cyan-500' };
    case 'hand':
      return { title: 'Mão', icon: Hand, color: 'text-green-500' };
    default:
      return { title: 'Zona', icon: Layers, color: 'text-muted-foreground' };
  }
};

export const ZoneViewerModal = ({
  open,
  onClose,
  zone,
  cards,
  onCardClick,
  onAddToHand,
  onSendToGY,
  onSendToBanished,
  onReturnToTop,
  onReturnToBottom,
  onShuffleIn,
  onShuffle,
  onDraw,
  onInvokeToField,
  hasXYZMonster,
  onAttachAsMaterial,
  isDeck = false,
}: ZoneViewerModalProps) => {
  if (!zone) return null;

  const { title, icon: Icon, color } = getZoneInfo(zone);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={cn("h-5 w-5", color)} />
            {title}
            <Badge variant="secondary">{cards.length} cartas</Badge>
          </DialogTitle>
        </DialogHeader>

        {/* Deck Actions */}
        {isDeck && (
          <div className="flex gap-2 flex-wrap">
            {onDraw && (
              <Button variant="outline" size="sm" onClick={onDraw}>
                <Hand className="h-3 w-3 mr-1" />
                Comprar
              </Button>
            )}
            {onShuffle && (
              <Button variant="outline" size="sm" onClick={onShuffle}>
                <Shuffle className="h-3 w-3 mr-1" />
                Embaralhar
              </Button>
            )}
          </div>
        )}

        <ScrollArea className="h-[400px] pr-3">
          {cards.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <Icon className={cn("h-8 w-8 mb-2", color)} />
              <p className="text-sm">Nenhuma carta nesta zona</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {cards.map((card, idx) => (
                <div
                  key={card.instanceId}
                  className="relative group cursor-pointer"
                  onClick={() => onCardClick(card, idx)}
                >
                  <img
                    src={card.card_images?.[0]?.image_url_small}
                    alt={card.name}
                    className="w-full rounded-md shadow-sm hover:shadow-lg transition-all hover:scale-105"
                    title={card.name}
                  />
                  
                  {/* Quick Actions Overlay */}
                  <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity rounded-md flex flex-col items-center justify-center gap-1 p-1">
                    <span className="text-[8px] text-white text-center line-clamp-2">{card.name}</span>
                    
                    <div className="flex gap-1 flex-wrap justify-center">
                      {zone !== 'graveyard' && onSendToGY && (
                        <Button
                          variant="secondary"
                          size="icon"
                          className="h-5 w-5"
                          onClick={(e) => { e.stopPropagation(); onSendToGY(card, idx); }}
                          title="Enviar ao Cemitério"
                        >
                          <Flame className="h-3 w-3" />
                        </Button>
                      )}

                      {zone !== 'banished' && onSendToBanished && (
                        <Button
                          variant="secondary"
                          size="icon"
                          className="h-5 w-5"
                          onClick={(e) => { e.stopPropagation(); onSendToBanished(card, idx); }}
                          title="Banir"
                        >
                          <Ban className="h-3 w-3" />
                        </Button>
                      )}

                      {onInvokeToField && (zone === 'deck' || zone === 'extraDeck' || zone === 'graveyard' || zone === 'banished') && (
                        <Button
                          variant="default"
                          size="icon"
                          className="h-5 w-5"
                          onClick={(e) => { e.stopPropagation(); onInvokeToField(card, idx); }}
                          title="Invocar ao Campo"
                        >
                          <Sparkles className="h-3 w-3" />
                        </Button>
                      )}

                      {hasXYZMonster && onAttachAsMaterial && (zone === 'hand' || zone === 'deck' || zone === 'extraDeck' || zone === 'graveyard' || zone === 'banished') && (
                        <Button
                          variant="default"
                          size="icon"
                          className="h-5 w-5"
                          onClick={(e) => { e.stopPropagation(); onAttachAsMaterial(card, idx); }}
                          title="Anexar como Material"
                        >
                          <Layers className="h-3 w-3" />
                        </Button>
                      )}
                      
                      {isDeck && (
                        <>
                          {onReturnToTop && (
                            <Button
                              variant="secondary"
                              size="icon"
                              className="h-5 w-5"
                              onClick={(e) => { e.stopPropagation(); onReturnToTop(card, idx); }}
                              title="Topo do Deck"
                            >
                              <ArrowUp className="h-3 w-3" />
                            </Button>
                          )}
                          {onReturnToBottom && (
                            <Button
                              variant="secondary"
                              size="icon"
                              className="h-5 w-5"
                              onClick={(e) => { e.stopPropagation(); onReturnToBottom(card, idx); }}
                              title="Fundo do Deck"
                            >
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
