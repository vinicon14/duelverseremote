import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { 
  Eye, 
  EyeOff, 
  Flame, 
  Ban, 
  Hand, 
  ArrowUp, 
  ArrowDown, 
  Shuffle,
  RotateCw,
  Sword,
  Shield,
  Link2,
  Sparkles,
  Trash2,
  BookOpen
} from 'lucide-react';
import { FieldZoneType, GameCard } from './DuelFieldBoard';
import { CardDetailViewModal } from './CardDetailViewModal';

interface FieldCardActionsModalProps {
  open: boolean;
  onClose: () => void;
  card: GameCard | null;
  zone: FieldZoneType | null;
  onFlipFaceUp: () => void;
  onFlipFaceDown: () => void;
  onTogglePosition: () => void;
  onSendToGraveyard: () => void;
  onSendToBanished: () => void;
  onReturnToHand: () => void;
  onReturnToTopOfDeck: () => void;
  onReturnToBottomOfDeck: () => void;
  onShuffleIntoDeck: () => void;
  onReturnToExtraDeck: () => void;
  onAttachMaterial: () => void;
  onDetachMaterial: (materialIndex: number) => void;
  isExtraDeckCard: boolean;
}

export const FieldCardActionsModal = ({
  open,
  onClose,
  card,
  zone,
  onFlipFaceUp,
  onFlipFaceDown,
  onTogglePosition,
  onSendToGraveyard,
  onSendToBanished,
  onReturnToHand,
  onReturnToTopOfDeck,
  onReturnToBottomOfDeck,
  onShuffleIntoDeck,
  onReturnToExtraDeck,
  onAttachMaterial,
  onDetachMaterial,
  isExtraDeckCard,
}: FieldCardActionsModalProps) => {
  const [showCardDetail, setShowCardDetail] = useState(false);
  
  if (!card || !zone) return null;

  const isMonsterZone = zone.includes('monster') || zone.includes('Monster');
  const isSpellTrapZone = zone.includes('spell');
  const isFieldSpellZone = zone === 'fieldSpell';
  const isXYZ = card.type.includes('XYZ');
  const isLink = card.type.includes('Link');
  const hasMaterials = card.attachedCards && card.attachedCards.length > 0;

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Ações da Carta</DialogTitle>
        </DialogHeader>

        <div className="flex gap-3">
          {/* Card Preview */}
          <div className="w-20 flex-shrink-0">
            <img
              src={card.isFaceDown 
                ? 'https://images.ygoprodeck.com/images/cards/back_high.jpg'
                : card.card_images?.[0]?.image_url_small
              }
              alt={card.name}
              className={cn(
                "w-full rounded-md shadow-md",
                card.position === 'defense' && "rotate-90"
              )}
            />
            {hasMaterials && (
              <div className="mt-1 flex items-center justify-center">
                <Badge variant="secondary" className="text-xs">
                  <Link2 className="h-3 w-3 mr-1" />
                  {card.attachedCards!.length} materiais
                </Badge>
              </div>
            )}
          </div>

          <div className="flex-1 space-y-3">
            <div>
              <h4 className="font-medium text-sm">
                {card.isFaceDown ? 'Carta virada para baixo' : card.name}
              </h4>
              {!card.isFaceDown && (
                <p className="text-xs text-muted-foreground">{card.type}</p>
              )}
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={card.position === 'attack' ? 'default' : 'secondary'} className="text-xs">
                  {card.position === 'attack' ? (
                    <><Sword className="h-3 w-3 mr-1" /> Ataque</>
                  ) : (
                    <><Shield className="h-3 w-3 mr-1" /> Defesa</>
                  )}
                </Badge>
                {card.isFaceDown && (
                  <Badge variant="outline" className="text-xs">
                    <EyeOff className="h-3 w-3 mr-1" /> Face-down
                  </Badge>
                )}
              </div>
            </div>

            {/* View Card Effect Button */}
            {!card.isFaceDown && (
              <Button
                variant="default"
                size="sm"
                className="w-full h-8 text-xs"
                onClick={() => setShowCardDetail(true)}
              >
                <BookOpen className="h-3 w-3 mr-1" />
                Ver Efeito
              </Button>
            )}

            <div className="grid grid-cols-2 gap-1.5">
              {/* Flip Actions */}
              {card.isFaceDown ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => handleAction(onFlipFaceUp)}
                >
                  <Eye className="h-3 w-3 mr-1" />
                  Virar
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => handleAction(onFlipFaceDown)}
                >
                  <EyeOff className="h-3 w-3 mr-1" />
                  Virar
                </Button>
              )}

              {/* Position Toggle - Only for monsters, not Link */}
              {isMonsterZone && !isLink && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => handleAction(onTogglePosition)}
                >
                  <RotateCw className="h-3 w-3 mr-1" />
                  Posição
                </Button>
              )}

              {/* Send to GY */}
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => handleAction(onSendToGraveyard)}
              >
                <Flame className="h-3 w-3 mr-1" />
                Cemitério
              </Button>

              {/* Send to Banished */}
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => handleAction(onSendToBanished)}
              >
                <Ban className="h-3 w-3 mr-1" />
                Banir
              </Button>

              {/* Return to Hand */}
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => handleAction(onReturnToHand)}
              >
                <Hand className="h-3 w-3 mr-1" />
                Mão
              </Button>

              {/* Return to Deck Options */}
              {!isExtraDeckCard ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => handleAction(onReturnToTopOfDeck)}
                  >
                    <ArrowUp className="h-3 w-3 mr-1" />
                    Topo
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => handleAction(onReturnToBottomOfDeck)}
                  >
                    <ArrowDown className="h-3 w-3 mr-1" />
                    Fundo
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => handleAction(onShuffleIntoDeck)}
                  >
                    <Shuffle className="h-3 w-3 mr-1" />
                    Embaralhar
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs col-span-2"
                  onClick={() => handleAction(onReturnToExtraDeck)}
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  Extra Deck
                </Button>
              )}

              {/* XYZ Material Actions */}
              {isXYZ && isMonsterZone && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8 text-xs col-span-2"
                  onClick={() => handleAction(onAttachMaterial)}
                >
                  <Link2 className="h-3 w-3 mr-1" />
                  Anexar Material
                </Button>
              )}
            </div>

            {/* Materials List */}
            {hasMaterials && (
              <div className="pt-2 border-t">
                <p className="text-xs font-medium mb-1.5">Materiais XYZ:</p>
                <div className="flex flex-wrap gap-1">
                  {card.attachedCards!.map((mat, idx) => (
                    <div
                      key={mat.instanceId}
                      className="relative group"
                    >
                      <img
                        src={mat.card_images?.[0]?.image_url_small}
                        alt={mat.name}
                        className="h-12 w-auto rounded shadow-sm"
                        title={mat.name}
                      />
                      <Button
                        variant="destructive"
                        size="icon"
                        className="h-4 w-4 absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => onDetachMaterial(idx)}
                        title="Destacar material"
                      >
                        <Trash2 className="h-2 w-2" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>

      {/* Card Detail View Modal */}
      <CardDetailViewModal
        open={showCardDetail}
        onClose={() => setShowCardDetail(false)}
        card={card}
      />
    </Dialog>
  );
};
