import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Hand, 
  Layers, 
  Flame, 
  Ban, 
  ArrowUp, 
  ArrowDown, 
  Shuffle,
  Sparkles
} from 'lucide-react';
import { YugiohCard } from '@/hooks/useYugiohCards';
import { cn } from '@/lib/utils';

type ZoneType = 'hand' | 'field' | 'graveyard' | 'banished' | 'deckPile' | 'extraDeckPile' | 'sideDeckPile';

interface CardActionsModalProps {
  card: YugiohCard | null;
  open: boolean;
  onClose: () => void;
  currentZone: ZoneType;
  cardIndex: number;
  onMoveToZone: (toZone: ZoneType) => void;
  onReturnToTopOfDeck: () => void;
  onReturnToBottomOfDeck: () => void;
  onShuffleIntoDeck: () => void;
  onSendToExtraDeck: () => void;
  isExtraDeckCard: boolean;
}

export const CardActionsModal = ({
  card,
  open,
  onClose,
  currentZone,
  onMoveToZone,
  onReturnToTopOfDeck,
  onReturnToBottomOfDeck,
  onShuffleIntoDeck,
  onSendToExtraDeck,
  isExtraDeckCard,
}: CardActionsModalProps) => {
  if (!card) return null;

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  const zoneLabels: Record<string, { label: string; icon: typeof Hand; color: string }> = {
    hand: { label: 'Mão', icon: Hand, color: 'text-blue-500' },
    field: { label: 'Campo', icon: Layers, color: 'text-green-500' },
    graveyard: { label: 'Cemitério', icon: Flame, color: 'text-orange-500' },
    banished: { label: 'Banido', icon: Ban, color: 'text-purple-500' },
    deckPile: { label: 'Deck', icon: Layers, color: 'text-gray-500' },
    extraDeckPile: { label: 'Extra Deck', icon: Sparkles, color: 'text-yellow-500' },
    sideDeckPile: { label: 'Side Deck', icon: Layers, color: 'text-cyan-500' },
  };

  const availableZones: ZoneType[] = (['hand', 'field', 'graveyard', 'banished'] as ZoneType[]).filter(
    zone => zone !== currentZone
  );

  const currentZoneLabel = zoneLabels[currentZone]?.label || currentZone;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            Ações da Carta
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-4 mb-4">
          <img
            src={card.card_images?.[0]?.image_url_small || card.card_images?.[0]?.image_url}
            alt={card.name}
            className="w-24 h-auto rounded-lg shadow-lg"
          />
          <div className="flex flex-col gap-1">
            <h3 className="font-bold text-sm">{card.name}</h3>
            <Badge variant="outline" className="w-fit text-xs">
              {card.type}
            </Badge>
            {card.atk !== undefined && (
              <span className="text-xs text-muted-foreground">
                ATK: {card.atk} / DEF: {card.def}
              </span>
            )}
            {card.level && (
              <span className="text-xs text-muted-foreground">
                Level: {card.level}
              </span>
            )}
            <Badge variant="secondary" className="w-fit text-xs mt-1">
              Zona atual: {currentZoneLabel}
            </Badge>
          </div>
        </div>

        <ScrollArea className="max-h-48 pr-2">
          <p className="text-xs text-muted-foreground">{card.desc}</p>
        </ScrollArea>

        <div className="space-y-4 mt-4">
          {/* Move to Zone Actions */}
          <div className="space-y-2">
            <span className="text-sm font-medium">Mover para:</span>
            <div className="grid grid-cols-2 gap-2">
              {availableZones.map((zone) => {
                const zoneInfo = zoneLabels[zone];
                const Icon = zoneInfo.icon;
                return (
                  <Button
                    key={zone}
                    variant="outline"
                    size="sm"
                    className="justify-start gap-2"
                    onClick={() => handleAction(() => onMoveToZone(zone))}
                  >
                    <Icon className={cn("h-4 w-4", zoneInfo.color)} />
                    {zoneInfo.label}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* Deck Actions */}
          {currentZone !== 'deckPile' && currentZone !== 'extraDeckPile' && currentZone !== 'sideDeckPile' && (
            <div className="space-y-2">
              <span className="text-sm font-medium">Devolver ao Deck:</span>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start gap-1 text-xs"
                  onClick={() => handleAction(onReturnToTopOfDeck)}
                >
                  <ArrowUp className="h-3 w-3" />
                  Topo
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start gap-1 text-xs"
                  onClick={() => handleAction(onReturnToBottomOfDeck)}
                >
                  <ArrowDown className="h-3 w-3" />
                  Fundo
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start gap-1 text-xs"
                  onClick={() => handleAction(onShuffleIntoDeck)}
                >
                  <Shuffle className="h-3 w-3" />
                  Embaralhar
                </Button>
              </div>
            </div>
          )}

          {/* Extra Deck Actions */}
          {isExtraDeckCard && currentZone !== 'extraDeckPile' && (
            <div className="space-y-2">
              <span className="text-sm font-medium">Extra Deck:</span>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => handleAction(onSendToExtraDeck)}
              >
                <Sparkles className="h-4 w-4 text-yellow-500" />
                Devolver ao Extra Deck
              </Button>
            </div>
          )}
        </div>

        <Button variant="secondary" className="w-full mt-4" onClick={onClose}>
          Fechar
        </Button>
      </DialogContent>
    </Dialog>
  );
};
