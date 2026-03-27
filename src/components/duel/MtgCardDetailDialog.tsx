import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BookOpen, ChevronDown, Swords, Shield } from 'lucide-react';
import { MagicCard, MagicZoneType } from './MagicFieldBoard';
import { getMagicCardImage, MTG_CARD_BACK } from './mtgCardImage';

interface MtgCardDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: MagicCard | null;
  cardZone: MagicZoneType;
  moveTargets: MagicZoneType[];
  zoneLabels: Record<string, string>;
  onMoveCardTo: (zone: MagicZoneType) => void;
  onToggleFaceDown: (card: MagicCard) => void;
  onTapCard: (card: MagicCard) => void;
  onModifyCounters: (card: MagicCard, delta: number) => void;
}

export const MtgCardDetailDialog = ({
  open,
  onOpenChange,
  card,
  cardZone,
  moveTargets,
  zoneLabels,
  onMoveCardTo,
  onToggleFaceDown,
  onTapCard,
  onModifyCounters,
}: MtgCardDetailDialogProps) => {
  const [showEffect, setShowEffect] = useState(false);

  if (!card) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setShowEffect(false); }}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm truncate">{card.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex justify-center">
            <img
              src={getMagicCardImage(card, 'normal')}
              alt={card.name}
              className="w-48 rounded-lg shadow-md"
              onError={(e) => { (e.target as HTMLImageElement).src = MTG_CARD_BACK; }}
            />
          </div>

          {card.type_line && (
            <p className="text-xs text-muted-foreground text-center">
              {[card.mana_cost, card.type_line].filter(Boolean).join(' — ')}
            </p>
          )}

          {/* Power/Toughness like YGO ATK/DEF */}
          {(card.power || card.toughness) && (
            <div className="flex items-center justify-center gap-2">
              {card.power && (
                <Badge className="bg-destructive/20 text-destructive border-0 text-xs">
                  <Swords className="h-3 w-3 mr-1" />
                  Poder {card.power}
                </Badge>
              )}
              {card.toughness && (
                <Badge className="bg-primary/20 text-primary border-0 text-xs">
                  <Shield className="h-3 w-3 mr-1" />
                  Resistência {card.toughness}
                </Badge>
              )}
            </div>
          )}

          {/* Read Effect toggle like YGO - always show if card has any text info */}
          {(card.oracle_text || card.type_line || card.mana_cost) && (
            <>
              {!showEffect ? (
                <Button onClick={() => setShowEffect(true)} variant="default" className="w-full" size="sm">
                  <BookOpen className="h-4 w-4 mr-2" />
                  Ler Efeito
                </Button>
              ) : (
                <>
                  <div className="border-t pt-2 space-y-1">
                    {card.type_line && (
                      <p className="text-xs"><span className="font-semibold text-muted-foreground">TIPO: </span>{card.type_line}</p>
                    )}
                    {card.mana_cost && (
                      <p className="text-xs"><span className="font-semibold text-muted-foreground">CUSTO: </span>{card.mana_cost}</p>
                    )}
                    {card.oracle_text && (
                      <>
                        <p className="text-xs font-semibold text-muted-foreground mt-2">EFEITO</p>
                        <p className="text-xs leading-relaxed whitespace-pre-wrap">{card.oracle_text}</p>
                      </>
                    )}
                  </div>
                  <Button onClick={() => setShowEffect(false)} variant="outline" className="w-full" size="sm">
                    <ChevronDown className="h-4 w-4 mr-2" />
                    Esconder Efeito
                  </Button>
                </>
              )}
            </>
          )}

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Mover para:</p>
            <div className="grid grid-cols-3 gap-1.5">
              {moveTargets
                .filter((z) => z !== cardZone)
                .map((zone) => (
                  <Button
                    key={zone}
                    size="sm"
                    variant="outline"
                    className="text-xs h-8"
                    onClick={() => onMoveCardTo(zone)}
                  >
                    {zoneLabels[zone]}
                  </Button>
                ))}
            </div>

            {(cardZone === 'battlefield' || cardZone === 'lands' || cardZone === 'hand' || cardZone === 'stack') && (
              <div className="flex gap-1.5 pt-1 flex-wrap">
                <Button size="sm" variant="outline" className="text-xs h-7 flex-1" onClick={() => onToggleFaceDown(card)}>
                  {card.isFaceDown ? '🔄 Virar (Face Up)' : '🔄 Virar (Face Down)'}
                </Button>
                {(cardZone === 'battlefield' || cardZone === 'lands') && (
                  <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => onTapCard(card)}>
                    {cardZone === 'lands'
                      ? (card.isTapped ? '↺ Desvirar terreno' : '💧 Gerar mana')
                      : (card.isTapped ? '↺ Desvirar' : '↩ Virar')}
                  </Button>
                )}
                {(cardZone === 'battlefield' || cardZone === 'lands') && (
                  <>
                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => onModifyCounters(card, 1)}>
                      +1 Counter
                    </Button>
                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => onModifyCounters(card, -1)}>
                      -1 Counter
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
