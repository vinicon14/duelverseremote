import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, EyeOff, Shield, Sword, Sparkles } from 'lucide-react';
import { FieldZoneType, GameCard } from './DuelFieldBoard';

export type SummonType = 'normal' | 'special' | 'synchro' | 'xyz' | 'link' | 'pendulum' | 'set' | 'activate';

interface ZonePlacementModalProps {
  open: boolean;
  onClose: () => void;
  card: GameCard | null;
  onPlaceCard: (zone: FieldZoneType, faceDown: boolean, position: 'attack' | 'defense', summonType: SummonType) => void;
  occupiedZones: FieldZoneType[];
}

const MONSTER_ZONES: FieldZoneType[] = ['monster1', 'monster2', 'monster3', 'monster4', 'monster5'];
const EXTRA_MONSTER_ZONES: FieldZoneType[] = ['extraMonster1'];
const SPELL_TRAP_ZONES: FieldZoneType[] = ['spell1', 'spell2', 'spell3', 'spell4', 'spell5'];

const isExtraDeckCardType = (type: string): boolean => {
  const extraTypes = ['Fusion', 'Synchro', 'XYZ', 'Link'];
  return extraTypes.some(t => type.includes(t));
};

const isSpellCard = (type: string): boolean => {
  return type.toLowerCase().includes('spell');
};

const isTrapCard = (type: string): boolean => {
  return type.toLowerCase().includes('trap');
};

const isMonsterCard = (type: string): boolean => {
  // Explicitly exclude spells and traps first
  if (isSpellCard(type) || isTrapCard(type)) return false;
  return type.toLowerCase().includes('monster');
};

const isFieldSpell = (card: GameCard): boolean => {
  const type = card.type?.toLowerCase() || '';
  const name = card.name?.toLowerCase() || '';
  return type.includes('field') || name.includes('field') || card.race?.toLowerCase() === 'field';
};

export const ZonePlacementModal = ({
  open,
  onClose,
  card,
  onPlaceCard,
  occupiedZones,
}: ZonePlacementModalProps) => {
  const defaultSummonType = useMemo<SummonType>(() => {
    if (!card) return 'normal';
    const type = card.type.toLowerCase();
    const cardIsMonster = isMonsterCard(card.type);
    const cardIsExtraDeck = isExtraDeckCardType(card.type);
    if (type.includes('synchro')) return 'synchro';
    if (type.includes('xyz') || type.includes('x-y-z')) return 'xyz';
    if (type.includes('link')) return 'link';
    if (type.includes('pendulum')) return 'pendulum';
    if (cardIsExtraDeck) return 'special';
    return cardIsMonster ? 'normal' : 'activate';
  }, [card]);
  const [summonType, setSummonType] = useState<SummonType>(defaultSummonType);

  useEffect(() => {
    setSummonType(defaultSummonType);
  }, [defaultSummonType, open, card?.instanceId]);

  if (!card) return null;

  const isMonster = isMonsterCard(card.type);
  const isField = isFieldSpell(card);
  const isExtraDeck = isExtraDeckCardType(card.type);
  const isLinkMonster = card.type.includes('Link');

  const summonOptions: Array<{ value: SummonType; label: string }> = [
    { value: 'normal', label: 'Normal' },
    { value: 'special', label: 'Especial' },
    { value: 'synchro', label: 'Sincro' },
    { value: 'xyz', label: 'Xyz' },
    { value: 'link', label: 'Link' },
    { value: 'pendulum', label: 'Pêndulo' },
  ];

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

  const handlePlace = (
    zone: FieldZoneType,
    faceDown: boolean,
    position: 'attack' | 'defense',
    overrideType?: SummonType
  ) => {
    onPlaceCard(zone, faceDown, position, overrideType || (faceDown ? 'set' : summonType));
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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

            {isMonster && (
              <div className="space-y-2">
                <p className="text-xs font-medium">Tipo de invocação:</p>
                <div className="grid grid-cols-3 gap-1">
                  {summonOptions.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      variant={summonType === option.value ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setSummonType(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Field Spell Placement - Priority for Field Spells */}
            {isField && (
              <div className="space-y-2">
                <p className="text-xs font-medium">Zona de Campo:</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => handlePlace('fieldSpell', false, 'attack', 'activate')}
                  disabled={occupiedZones.includes('fieldSpell')}
                >
                  <Eye className="h-3 w-3 mr-1" />
                  Ativar Campo
                </Button>
              </div>
            )}

            {/* Monster Zone Options - Available for all cards */}
            {getAvailableMonsterZones().length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium">Zona de Monstro:</p>
                
                {/* Attack Position (Face-up) */}
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Sword className="h-3 w-3" /> Posição de Ataque (Face para cima)
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {getAvailableMonsterZones().map((zone) => (
                      <Button
                        key={zone}
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => handlePlace(zone, false, 'attack')}
                      >
                        {zone.includes('extra') ? 'EMZ' : `M${MONSTER_ZONES.indexOf(zone as (typeof MONSTER_ZONES)[number]) + 1}`}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Defense Position (Face-up) - Not for Link monsters */}
                {!isLinkMonster && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Shield className="h-3 w-3" /> Posição de Defesa (Face para cima)
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {getAvailableMonsterZones().filter(z => !z.includes('extra')).map((zone) => (
                        <Button
                          key={zone}
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => handlePlace(zone, false, 'defense')}
                        >
                          M{MONSTER_ZONES.indexOf(zone as (typeof MONSTER_ZONES)[number]) + 1}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Set (Face-down Defense) - Not for Extra Deck or Link monsters */}
                {!isExtraDeck && !isLinkMonster && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <EyeOff className="h-3 w-3" /> Baixar (Face para baixo em Defesa)
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {getAvailableMonsterZones().filter(z => !z.includes('extra')).map((zone) => (
                        <Button
                          key={zone}
                          variant="secondary"
                          size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => handlePlace(zone, true, 'defense', 'set')}
                      >
                          M{MONSTER_ZONES.indexOf(zone as (typeof MONSTER_ZONES)[number]) + 1}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Spell/Trap Zone Options - Available for all cards */}
            {getAvailableSpellTrapZones().length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium">Zona de Magia/Armadilha:</p>
                
                {/* Activate (Face-up) */}
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Eye className="h-3 w-3" /> Ativar (Face para cima)
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {getAvailableSpellTrapZones().map((zone) => (
                      <Button
                        key={zone}
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => handlePlace(zone, false, 'attack', 'activate')}
                      >
                        S/T{SPELL_TRAP_ZONES.indexOf(zone as (typeof SPELL_TRAP_ZONES)[number]) + 1}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Set (Face-down) */}
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <EyeOff className="h-3 w-3" /> Setar (Face para baixo)
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {getAvailableSpellTrapZones().map((zone) => (
                      <Button
                        key={zone}
                        variant="secondary"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => handlePlace(zone, true, 'attack', 'set')}
                      >
                        S/T{SPELL_TRAP_ZONES.indexOf(zone as (typeof SPELL_TRAP_ZONES)[number]) + 1}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Warning messages */}
            {getAvailableMonsterZones().length === 0 && getAvailableSpellTrapZones().length === 0 && (
              <p className="text-xs text-destructive">Todas as zonas estão ocupadas!</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
