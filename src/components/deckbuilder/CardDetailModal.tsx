import { YugiohCard, Language } from '@/hooks/useYugiohCards';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Swords, Shield, Star, Layers, Sparkles } from 'lucide-react';

interface CardDetailModalProps {
  card: YugiohCard | null;
  open: boolean;
  onClose: () => void;
  onAddToDeck: (card: YugiohCard, deckType: 'main' | 'extra' | 'side' | 'tokens') => void;
  language: Language;
  canAddToMain: boolean;
  canAddToExtra: boolean;
  canAddToSide: boolean;
  canAddToTokens: boolean;
  isExtraDeckCard: boolean;
}

const labels = {
  en: {
    addToMain: 'Add to Main',
    addToExtra: 'Add to Extra',
    addToSide: 'Add to Side',
    addToTokens: 'Add as Token',
    atk: 'ATK',
    def: 'DEF',
    level: 'Level',
    rank: 'Rank',
    link: 'Link',
    scale: 'Scale',
    type: 'Type',
    attribute: 'Attribute',
    effect: 'Effect',
  },
  pt: {
    addToMain: 'Add ao Principal',
    addToExtra: 'Add ao Extra',
    addToSide: 'Add ao Side',
    addToTokens: 'Adicionar como Ficha',
    atk: 'ATK',
    def: 'DEF',
    level: 'Nível',
    rank: 'Rank',
    link: 'Link',
    scale: 'Escala',
    type: 'Tipo',
    attribute: 'Atributo',
    effect: 'Efeito',
  },
};

export const CardDetailModal = ({
  card,
  open,
  onClose,
  onAddToDeck,
  language,
  canAddToMain,
  canAddToExtra,
  canAddToSide,
  canAddToTokens,
  isExtraDeckCard,
}: CardDetailModalProps) => {
  const t = labels[language];

  if (!card) return null;

  const isMonster = !card.type.includes('Spell') && !card.type.includes('Trap');
  const isLink = card.type.includes('Link');
  const isXyz = card.type.includes('XYZ');
  const isPendulum = card.type.includes('Pendulum');

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">{card.name}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[calc(95vh-100px)] overflow-y-auto">
          <div className="grid md:grid-cols-2 gap-4 p-1">
            {/* Card Image */}
            <div className="flex justify-center">
              <img
                src={card.card_images[0]?.image_url}
                alt={card.name}
                className="max-w-[250px] rounded-lg shadow-lg"
              />
            </div>

            {/* Card Info */}
            <div className="space-y-4">
              {/* Type Badge */}
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{card.type}</Badge>
                {card.attribute && (
                  <Badge variant="outline">{card.attribute}</Badge>
                )}
                <Badge variant="outline">{card.race}</Badge>
                {card.archetype && (
                  <Badge className="bg-primary/20">{card.archetype}</Badge>
                )}
              </div>

              {/* Stats */}
              {isMonster && (
                <div className="flex flex-wrap gap-3 text-sm">
                  {!isLink && card.level !== undefined && (
                    <div className="flex items-center gap-1">
                      <Star className="h-4 w-4 text-yellow-500" />
                      <span>{isXyz ? t.rank : t.level}: {card.level}</span>
                    </div>
                  )}
                  {isLink && card.linkval !== undefined && (
                    <div className="flex items-center gap-1">
                      <Layers className="h-4 w-4 text-blue-500" />
                      <span>{t.link}: {card.linkval}</span>
                    </div>
                  )}
                  {isPendulum && card.scale !== undefined && (
                    <div className="flex items-center gap-1">
                      <span className="text-purple-500 font-semibold">{t.scale}: {card.scale}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Swords className="h-4 w-4 text-red-500" />
                    <span>{t.atk}: {card.atk}</span>
                  </div>
                  {!isLink && (
                    <div className="flex items-center gap-1">
                      <Shield className="h-4 w-4 text-blue-500" />
                      <span>{t.def}: {card.def}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Link Markers */}
              {isLink && card.linkmarkers && (
                <div className="text-xs text-muted-foreground">
                  Markers: {card.linkmarkers.join(', ')}
                </div>
              )}

              {/* Description */}
              <div className="space-y-1">
                <h4 className="text-sm font-semibold">{t.effect}</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {card.desc}
                </p>
              </div>

              {/* Add Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                {!isExtraDeckCard && (
                  <Button
                    size="sm"
                    onClick={() => onAddToDeck(card, 'main')}
                    disabled={!canAddToMain}
                    className="gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    {t.addToMain}
                  </Button>
                )}
                {isExtraDeckCard && (
                  <Button
                    size="sm"
                    onClick={() => onAddToDeck(card, 'extra')}
                    disabled={!canAddToExtra}
                    className="gap-1"
                  >
                    <Plus className="h-3 w-3" />
                    {t.addToExtra}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onAddToDeck(card, 'side')}
                  disabled={!canAddToSide}
                  className="gap-1"
                >
                  <Plus className="h-3 w-3" />
                  {t.addToSide}
                </Button>
                {canAddToTokens && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onAddToDeck(card, 'tokens')}
                    className="gap-1"
                  >
                    <Sparkles className="h-3 w-3" />
                    {t.addToTokens}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
