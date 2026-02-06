import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Swords, Shield, Star, Sparkles } from 'lucide-react';

interface CardDetailViewModalProps {
  open: boolean;
  onClose: () => void;
  card: {
    id: number;
    name: string;
    type: string;
    desc: string;
    atk?: number;
    def?: number;
    level?: number;
    race: string;
    attribute?: string;
    card_images?: {
      id: number;
      image_url: string;
      image_url_small: string;
    }[];
  } | null;
}

export const CardDetailViewModal = ({ open, onClose, card }: CardDetailViewModalProps) => {
  if (!card) return null;

  const isMonster = card.type?.includes('Monster');
  const isSpell = card.type?.includes('Spell');
  const isTrap = card.type?.includes('Trap');

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="text-lg font-bold">{card.name}</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="max-h-[70vh]">
          <div className="p-4 space-y-4">
            {/* Card Image */}
            <div className="flex justify-center">
              <img
                src={card.card_images?.[0]?.image_url || card.card_images?.[0]?.image_url_small}
                alt={card.name}
                className="h-48 w-auto rounded-lg shadow-lg"
              />
            </div>

            {/* Card Info Badges */}
            <div className="flex flex-wrap gap-2 justify-center">
              <Badge variant="outline" className="text-xs">
                {card.type}
              </Badge>
              {card.attribute && (
                <Badge variant="secondary" className="text-xs">
                  {card.attribute}
                </Badge>
              )}
              <Badge variant="outline" className="text-xs">
                {card.race}
              </Badge>
            </div>

            {/* Level/Rank for Monsters */}
            {isMonster && card.level && (
              <div className="flex items-center justify-center gap-1">
                {card.type?.includes('XYZ') ? (
                  <Sparkles className="h-4 w-4 text-yellow-400" />
                ) : (
                  <Star className="h-4 w-4 text-yellow-400" />
                )}
                <span className="text-sm font-medium">
                  {card.type?.includes('XYZ') ? 'Rank' : card.type?.includes('Link') ? 'Link' : 'Level'} {card.level}
                </span>
              </div>
            )}

            {/* ATK/DEF for Monsters */}
            {isMonster && (
              <div className="flex items-center justify-center gap-4 py-2 px-4 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-1">
                  <Swords className="h-4 w-4 text-destructive" />
                  <span className="font-bold text-destructive">
                    {card.atk !== undefined ? card.atk : '?'}
                  </span>
                </div>
                {!card.type?.includes('Link') && (
                  <div className="flex items-center gap-1">
                    <Shield className="h-4 w-4 text-primary" />
                    <span className="font-bold text-primary">
                      {card.def !== undefined ? card.def : '?'}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Card Effect/Description */}
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">
                {isSpell || isTrap ? 'Efeito' : card.type?.includes('Normal') ? 'Texto' : 'Efeito'}
              </h4>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {card.desc}
              </p>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
