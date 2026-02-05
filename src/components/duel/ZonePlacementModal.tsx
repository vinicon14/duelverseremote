import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Eye, EyeOff, Shield, Sword, Sparkles } from 'lucide-react';
import { FieldZoneType, GameCard } from './DuelFieldBoard';
import { EXTRA_DECK_TYPES } from '@/constants/cardTypes';

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
  return EXTRA_DECK_TYPES.some(t => type.includes(t.replace(' Monster', '')));
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

            {/* Field Spell Placement - Priority for Field Spells */}
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
                        {zone.includes('extra') ? 'EMZ' : `M${MONSTER_ZONES.indexOf(zone as any) + 1}`}
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
                          M{MONSTER_ZONES.indexOf(zone as any) + 1}
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
                          onClick={() => handlePlace(zone, true, 'defense')}
                        >
                          M{MONSTER_ZONES.indexOf(zone as any) + 1}
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
                        onClick={() => handlePlace(zone, false, 'attack')}
                      >
                        S/T{SPELL_TRAP_ZONES.indexOf(zone as any) + 1}
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
                        onClick={() => handlePlace(zone, true, 'attack')}
                      >
                        S/T{SPELL_TRAP_ZONES.indexOf(zone as any) + 1}
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
