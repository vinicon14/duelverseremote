import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Swords, Shield, Star, Sparkles, BookOpen, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState, useEffect } from 'react';
import { useYugiohCards } from '@/hooks/useYugiohCards';

interface CardEffectModalProps {
  open: boolean;
  onClose: () => void;
  card: {
    id?: number;
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
  onPlaceCard?: () => void;
  showPlaceButton?: boolean;
  initialShowEffect?: boolean;
}

export const CardEffectModal = ({ open, onClose, card, onPlaceCard, showPlaceButton, initialShowEffect = false }: CardEffectModalProps) => {
  const [showEffect, setShowEffect] = useState(initialShowEffect);
  const [fetchedDesc, setFetchedDesc] = useState<string | null>(null);
  const { getCardById } = useYugiohCards();

  // Quando a carta não tem descrição (ex.: deck salvo antigo), buscar da API pelo id
  useEffect(() => {
    if (!open || !card) {
      setFetchedDesc(null);
      return;
    }
    const hasDesc = card.desc && card.desc.trim().length > 0;
    if (hasDesc) {
      setFetchedDesc(null);
      return;
    }
    const cardId = card.id;
    if (!cardId) {
      setFetchedDesc(null);
      return;
    }
    setFetchedDesc(null);
    let cancelled = false;
    getCardById(cardId, 'pt').then((full) => {
      if (!cancelled && full?.desc) setFetchedDesc(full.desc);
    }).catch(() => {
      if (!cancelled) getCardById(cardId, 'en').then((full) => {
        if (!cancelled && full?.desc) setFetchedDesc(full.desc);
      });
    });
    return () => { cancelled = true; };
  }, [open, card?.id, getCardById]);

  if (!card) return null;

  const isMonster = card.atk !== undefined;
  const effectText = (card.desc && card.desc.trim()) || fetchedDesc || '';
  const isLoadingDesc = !effectText && !!card.id;
  const isLong = effectText && effectText.length > 150;

  return (
    <Dialog open={open} onOpenChange={() => {
      onClose();
      setShowEffect(false);
    }}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0 flex flex-col">
        <DialogHeader className="border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <DialogTitle className="text-lg">{card.name}</DialogTitle>
          </div>
        </DialogHeader>

        <div className="flex gap-4 px-6 pt-4 pb-4 overflow-hidden flex-1 flex-col min-h-0">
          {/* Card Preview */}
          <div className="flex gap-4">
            <div className="w-24 flex-shrink-0 rounded-lg overflow-hidden shadow-lg bg-muted">
              <img
                src={card.card_images?.[0]?.image_url_small}
                alt={card.name}
                className="w-full h-auto object-cover"
              />
            </div>

            {/* Card Info */}
            <div className="flex-1 space-y-2">
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline" className="text-xs">
                  {card.type}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {card.race}
                </Badge>
                {card.attribute && (
                  <Badge className="text-xs bg-primary/20 text-primary border-0">
                    {card.attribute}
                  </Badge>
                )}
              </div>

              {isMonster && (
                <div className="flex items-center gap-3 text-xs gap-2 flex-wrap">
                  {card.level && (
                    <Badge variant="outline" className="text-xs">
                      <Star className="h-3 w-3 mr-1 text-yellow-500" />
                      Nível {card.level}
                    </Badge>
                  )}
                  <Badge className="bg-destructive/20 text-destructive border-0 text-xs">
                    <Swords className="h-3 w-3 mr-1" />
                    ATK {card.atk}
                  </Badge>
                  <Badge className="bg-primary/20 text-primary border-0 text-xs">
                    <Shield className="h-3 w-3 mr-1" />
                    DEF {card.def ?? '?'}
                  </Badge>
                </div>
              )}
            </div>
          </div>

          {/* Card Description with Auto-Scroll */}
          {showEffect && (
            <div className="border-t pt-4 flex-1 flex flex-col min-h-0 overflow-hidden">
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">EFEITO</h4>
              <div className="flex-1 overflow-y-auto">
                {isLoadingDesc ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando efeito...
                  </div>
                ) : effectText ? (
                  <div className="text-sm leading-relaxed whitespace-pre-wrap pr-4 pb-2">
                    {effectText}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Efeito não disponível para esta carta.</p>
                )}
              </div>
            </div>
          )}

          {/* Footer with Action Buttons */}
          <div className="border-t pt-3 pb-2 flex flex-col gap-2 flex-shrink-0">
            {!showEffect && (
              <Button
                onClick={() => setShowEffect(true)}
                variant="default"
                className="w-full"
                size="sm"
              >
                <BookOpen className="h-4 w-4 mr-2" />
                Ler Efeito
              </Button>
            )}
            {showEffect && (
              <Button
                onClick={() => setShowEffect(false)}
                variant="outline"
                className="w-full"
                size="sm"
              >
                <ChevronDown className="h-4 w-4 mr-2" />
                Esconder Efeito
              </Button>
            )}
            {showPlaceButton && onPlaceCard && (
              <Button
                onClick={() => {
                  onPlaceCard();
                  onClose();
                }}
                className="w-full"
                size="sm"
              >
                Colocar no Campo
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
