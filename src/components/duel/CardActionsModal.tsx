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
  Sparkles,
  EyeOff,
  Eye,
  RotateCw,
  Link2,
  Unlink,
  Crown,
  BookOpen
} from 'lucide-react';
import { YugiohCard } from '@/hooks/useYugiohCards';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { CardEffectModal } from './CardEffectModal';

type ZoneType = 'hand' | 'field' | 'graveyard' | 'banished' | 'deckPile' | 'extraDeckPile' | 'sideDeckPile' | 'fieldZone';

interface GameCard extends YugiohCard {
  instanceId: string;
  isFaceDown?: boolean;
  attachedCards?: GameCard[];
  position?: 'attack' | 'defense';
}

interface CardActionsModalProps {
  card: GameCard | null;
  open: boolean;
  onClose: () => void;
  currentZone: ZoneType;
  cardIndex: number;
  onMoveToZone: (toZone: ZoneType) => void;
  onSetFaceDown?: () => void;
  onFlipFaceUp?: () => void;
  onTogglePosition?: () => void;
  onAttachMaterial?: () => void;
  onDetachMaterial?: (materialIndex: number) => void;
  onReturnToTopOfDeck: () => void;
  onReturnToBottomOfDeck: () => void;
  onShuffleIntoDeck: () => void;
  onSendToExtraDeck: () => void;
  onMoveToFieldZone?: () => void;
  isExtraDeckCard: boolean;
  isXYZCard?: boolean;
  isFaceDown?: boolean;
  isOnField?: boolean;
  isFieldSpell?: boolean;
  attachedMaterials?: GameCard[];
}

export const CardActionsModal = ({
  card,
  open,
  onClose,
  currentZone,
  onMoveToZone,
  onSetFaceDown,
  onFlipFaceUp,
  onTogglePosition,
  onAttachMaterial,
  onDetachMaterial,
  onReturnToTopOfDeck,
  onReturnToBottomOfDeck,
  onShuffleIntoDeck,
  onSendToExtraDeck,
  onMoveToFieldZone,
  isExtraDeckCard,
  isXYZCard,
  isFaceDown,
  isOnField,
  isFieldSpell,
  attachedMaterials = [],
}: CardActionsModalProps) => {
  const [showEffectModal, setShowEffectModal] = useState(false);

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
    fieldZone: { label: 'Zona de Campo', icon: Crown, color: 'text-emerald-500' },
  };

  const availableZones: ZoneType[] = (['hand', 'field', 'graveyard', 'banished'] as ZoneType[]).filter(
    zone => zone !== currentZone
  );

  const currentZoneLabel = zoneLabels[currentZone]?.label || currentZone;

  return (
    <>
      <CardEffectModal 
        open={showEffectModal} 
        onClose={() => setShowEffectModal(false)} 
        card={card}
        initialShowEffect={true}
      />
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <DialogContent className="sm:max-w-md max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              Ações da Carta
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[70vh]">
            <div className="space-y-4 pr-2">
              {/* Card Preview */}
              <div className="flex gap-4">
                <img
                  src={isFaceDown ? 'https://images.ygoprodeck.com/images/cards/back_high.jpg' : (card.card_images?.[0]?.image_url_small || card.card_images?.[0]?.image_url)}
                  alt={card.name}
                  className="w-20 h-auto rounded-lg shadow-lg"
                />
                <div className="flex flex-col gap-1 flex-1">
                  <h3 className="font-bold text-sm">{isFaceDown ? 'Carta Virada' : card.name}</h3>
                  {!isFaceDown && (
                    <>
                      <Badge variant="outline" className="w-fit text-xs">
                        {card.type}
                      </Badge>
                      {card.atk !== undefined && (
                        <span className="text-xs text-muted-foreground">
                          ATK: {card.atk} / DEF: {card.def}
                        </span>
                      )}
                    </>
                  )}
                  <Badge variant="secondary" className="w-fit text-xs mt-1">
                    Zona: {currentZoneLabel}
                  </Badge>
                </div>
              </div>

              {/* Read Effect Button */}
              {!isFaceDown && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-8 text-xs"
                  onClick={() => setShowEffectModal(true)}
                >
                  <BookOpen className="h-3 w-3 mr-1" />
                  Ler Efeito
                </Button>
              )}

            {/* Face Down / Flip Actions */}
            {(currentZone === 'hand' || isOnField) && (
              <div className="space-y-2">
                <span className="text-sm font-medium">Posição:</span>
                <div className="grid grid-cols-2 gap-2">
                  {currentZone === 'hand' && onSetFaceDown && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="justify-start gap-2"
                      onClick={() => handleAction(onSetFaceDown)}
                    >
                      <EyeOff className="h-4 w-4 text-red-500" />
                      Baixar Virado
                    </Button>
                  )}
                  {isOnField && isFaceDown && onFlipFaceUp && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="justify-start gap-2"
                      onClick={() => handleAction(onFlipFaceUp)}
                    >
                      <Eye className="h-4 w-4 text-green-500" />
                      Virar p/ Cima
                    </Button>
                  )}
                  {isOnField && !isFaceDown && onSetFaceDown && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="justify-start gap-2"
                      onClick={() => handleAction(onSetFaceDown)}
                    >
                      <EyeOff className="h-4 w-4 text-red-500" />
                      Virar p/ Baixo
                    </Button>
                  )}
                  {isOnField && onTogglePosition && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="justify-start gap-2"
                      onClick={() => handleAction(onTogglePosition)}
                    >
                      <RotateCw className="h-4 w-4 text-blue-500" />
                      Mudar Posição
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* XYZ Material Actions */}
            {isOnField && isXYZCard && (
              <div className="space-y-2">
                <span className="text-sm font-medium">Materiais XYZ ({attachedMaterials.length}):</span>
                {attachedMaterials.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {attachedMaterials.map((mat, idx) => (
                      <Button
                        key={mat.instanceId}
                        variant="outline"
                        size="sm"
                        className="text-xs h-6 px-2"
                        onClick={() => onDetachMaterial?.(idx)}
                      >
                        <Unlink className="h-3 w-3 mr-1" />
                        {mat.name.substring(0, 15)}...
                      </Button>
                    ))}
                  </div>
                )}
                {onAttachMaterial && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full justify-start gap-2"
                    onClick={() => handleAction(onAttachMaterial)}
                  >
                    <Link2 className="h-4 w-4 text-yellow-500" />
                    Anexar Material
                  </Button>
                )}
              </div>
            )}

            {/* Field Zone for Field Spells */}
            {isFieldSpell && currentZone !== 'fieldZone' && onMoveToFieldZone && (
              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={() => handleAction(onMoveToFieldZone)}
                >
                  <Crown className="h-4 w-4 text-emerald-500" />
                  Ativar na Zona de Campo
                </Button>
              </div>
            )}

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

            <Button variant="secondary" className="w-full" onClick={onClose}>
              Fechar
            </Button>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
    </>
  );
};
