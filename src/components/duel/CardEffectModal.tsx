import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Swords, Shield, Star, Sparkles } from 'lucide-react';

interface CardEffectModalProps {
  open: boolean;
  onClose: () => void;
  card: {
    name: string;
    type: string;
    desc: string;
    atk?: number;
    def?: number;
    level?: number;
    race: string;
    attribute?: string;
    card_images?: {
      image_url_small: string;
    }[];
  } | null;
}

export const CardEffectModal = ({ open, onClose, card }: CardEffectModalProps) => {
  if (!card) return null;

  const isMonster = card.atk !== undefined;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            Efeito da Carta
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-4">
          {/* Card Image */}
          <div className="w-24 flex-shrink-0">
            <img
              src={card.card_images?.[0]?.image_url_small}
              alt={card.name}
              className="w-full rounded-lg shadow-lg"
            />
          </div>

          {/* Card Info */}
          <div className="flex-1 space-y-2">
            <h3 className="font-bold text-base">{card.name}</h3>
            
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline" className="text-xs">
                {card.type}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {card.race}
              </Badge>
              {card.attribute && (
                <Badge className="text-xs bg-primary/20 text-primary">
                  {card.attribute}
                </Badge>
              )}
            </div>

            {isMonster && (
              <div className="flex items-center gap-3 text-sm">
                {card.level && (
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 text-yellow-500" />
                    <span>Nível {card.level}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Swords className="h-4 w-4 text-destructive" />
                  <span>{card.atk}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Shield className="h-4 w-4 text-primary" />
                  <span>{card.def ?? '?'}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Card Description */}
        <ScrollArea className="max-h-[300px]">
          <div className="p-3 bg-muted/30 rounded-lg border border-border/50">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {card.desc || 'Sem descrição disponível.'}
            </p>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
