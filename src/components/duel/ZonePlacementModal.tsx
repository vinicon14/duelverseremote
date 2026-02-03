import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Eye, EyeOff, Shield, Sword, Sparkles } from 'lucide-react';
import { FieldZoneType, GameCard } from './DuelFieldBoard';

interface ZonePlacementModalProps {
  open: boolean;
  onClose: () => void;
  card: GameCard | null;
  onPlaceCard: (zone: FieldZoneType, faceDown: boolean, position: 'attack' | 'defense') => void;
  occupiedZones: FieldZoneType[];
}

const MONSTER_ZONES: FieldZoneType[] = ['monster1', 'monster2', 'monster3', 'monster4', 'monster5'];
const EXTRA_MONSTER_ZONES: FieldZoneType[] = ['extraMonster1', 'extraMonster2'];
const SPELL_TRAP_ZONES: FieldZoneType[] = ['spell1', 'spell2', 'spell3', 'spell4', 'spell5'];

const isExtraDeckCardType = (type: string): boolean => {
  const extraTypes = ['Fusion', 'Synchro', 'XYZ', 'Link'];
  return extraTypes.some(t => type.includes(t));
};

const isMonsterCard = (type: string): boolean => {
  return type.includes('Monster');
};

const isSpellCard = (type: string): boolean => {
  return type.includes('Spell');
};

const isTrapCard = (type: string): boolean => {
  return type.includes('Trap');
};

const isFieldSpell = (type: string, race?: string): boolean => {
  return type === 'Spell Card' && race === 'Field';
};

export const ZonePlacementModal = ({
  open,
  onClose,
  card,
  onPlaceCard,
  occupiedZones,
}: ZonePlacementModalProps) => {
  if (!card) return null;

  const isMonster = isMonsterCard(card.type);
  const isSpell = isSpellCard(card.type);
  const isTrap = isTrapCard(card.type);
  const isField = isFieldSpell(card.type, card.race);
  const isExtraDeck = isExtraDeckCardType(card.type);
  const isLinkMonster = card.type.includes('Link');

  const getAvailableMonsterZones = (): FieldZoneType[] => {
    const zones = MONSTER_ZONES.filter(z => !occupiedZones.includes(z));
    if (isExtraDeck) {
      const extraZones = EXTRA_MONSTER_ZONES.filter(z => !occupiedZones.includes(z));
      return [...extraZones, ...zones];
    }
    return zones;
  };

  const getAvailableSpellTrapZones = (): FieldZoneType[] => {
    return SPELL_TRAP_ZONES.filter(z => !occupiedZones.includes(z));
  };

  const handlePlace = (zone: FieldZoneType, faceDown: boolean, position: 'attack' | 'defense') => {
    onPlaceCard(zone, faceDown, position);
    onClose();
  };

  const ZoneButton = ({
    zone,
    label,
    faceDown,
    position,
  }: {
    zone: FieldZoneType;
    label: string;
    faceDown: boolean;
    position: 'attack' | 'defense';
  }) => (
    <Button
      variant="outline"
      size="sm"
      className="h-auto py-2 px-3 flex flex-col items-center gap-1"
      onClick={() => handlePlace(zone, faceDown, position)}
    >
      <span className="text-xs">{label}</span>
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        {faceDown ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        {position === 'attack' ? <Sword className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
      </div>
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Colocar Carta no Campo
            {isExtraDeck && (
              <Badge variant="secondary" className="text-xs">
                <Sparkles className="h-3 w-3 mr-1" />
                Extra Deck
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-3 items-start">
          {/* Card Preview */}
          <div className="w-20 flex-shrink-0">
            <img
              src={card.card_images?.[0]?.image_url_small}
              alt={card.name}
              className="w-full rounded-md shadow-md"
            />
          </div>

          <div className="flex-1 space-y-3">
            <div>
              <h4 className="font-medium text-sm">{card.name}</h4>
              <p className="text-xs text-muted-foreground">{card.type}</p>
              {isMonster && (
                <p className="text-xs text-muted-foreground">
                  {card.attribute} / {card.race} {card.level && `★${card.level}`}
                  {card.atk !== undefined && ` ATK/${card.atk}`}
                  {card.def !== undefined && ` DEF/${card.def}`}
                </p>
              )}
            </div>

            {/* Monster Placement Options */}
            {isMonster && (
              <div className="space-y-2">
                <p className="text-xs font-medium">Zona de Monstro:</p>
                
                {/* Attack Position */}
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Sword className="h-3 w-3" /> Posição de Ataque (Face para cima)
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {getAvailableMonsterZones().map((zone, idx) => (
                      <Button
                        key={zone}
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => handlePlace(zone, false, 'attack')}
                      >
                        {zone.includes('extra') ? 'EMZ' : `M${idx + 1}`}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Defense Position - Not available for Link monsters */}
                {!isLinkMonster && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Shield className="h-3 w-3" /> Posição de Defesa (Face para cima)
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {getAvailableMonsterZones().filter(z => !z.includes('extra')).map((zone, idx) => (
                        <Button
                          key={zone}
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => handlePlace(zone, false, 'defense')}
                        >
                          M{idx + 1}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Set (Face-down Defense) - Not available for Extra Deck monsters or Link monsters */}
                {!isExtraDeck && !isLinkMonster && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <EyeOff className="h-3 w-3" /> Baixar (Face para baixo em Defesa)
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {getAvailableMonsterZones().filter(z => !z.includes('extra')).map((zone, idx) => (
                        <Button
                          key={zone}
                          variant="secondary"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => handlePlace(zone, true, 'defense')}
                        >
                          M{idx + 1}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Field Spell Placement */}
            {isField && (
              <div className="space-y-2">
                <p className="text-xs font-medium">Zona de Campo:</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => handlePlace('fieldSpell', false, 'attack')}
                  disabled={occupiedZones.includes('fieldSpell')}
                >
                  <Eye className="h-3 w-3 mr-1" />
                  Ativar Campo
                </Button>
              </div>
            )}

            {/* Spell/Trap Placement */}
            {(isSpell || isTrap) && !isField && (
              <div className="space-y-2">
                <p className="text-xs font-medium">Zona de Magia/Armadilha:</p>
                
                {/* Activate (Face-up) - Only for Spells */}
                {isSpell && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Eye className="h-3 w-3" /> Ativar (Face para cima)
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {getAvailableSpellTrapZones().map((zone, idx) => (
                        <Button
                          key={zone}
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => handlePlace(zone, false, 'attack')}
                        >
                          S/T{idx + 1}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Set (Face-down) */}
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <EyeOff className="h-3 w-3" /> Setar (Face para baixo)
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {getAvailableSpellTrapZones().map((zone, idx) => (
                      <Button
                        key={zone}
                        variant="secondary"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => handlePlace(zone, true, 'attack')}
                      >
                        S/T{idx + 1}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {getAvailableMonsterZones().length === 0 && isMonster && (
              <p className="text-xs text-destructive">Todas as zonas de monstro estão ocupadas!</p>
            )}
            
            {getAvailableSpellTrapZones().length === 0 && (isSpell || isTrap) && !isField && (
              <p className="text-xs text-destructive">Todas as zonas de magia/armadilha estão ocupadas!</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
