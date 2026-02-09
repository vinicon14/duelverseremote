import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Eye, EyeOff, Shield, Sword, Sparkles, AlertTriangle } from 'lucide-react';
import { FieldZoneType, GameCard } from './DuelFieldBoard';
import { 
  canPlaceInZone, 
  getAvailableZonesForCard,
  canNormalSummon,
  canNormalSet,
  canSpecialSummon,
  getRequiredTributes,
  isMonsterCard,
  isSpellCard,
  isTrapCard,
  isExtraDeckCardType,
  isFieldSpell
} from '../../utils/cardValidation';
import { useGameState } from '../../store/gameState';

interface ZonePlacementModalProps {
  open: boolean;
  onClose: () => void;
  card: GameCard | null;
  onPlaceCard: (zone: FieldZoneType, faceDown: boolean, position: 'attack' | 'defense') => void;
  occupiedZones: FieldZoneType[];
  fromZone?: FieldZoneType;
  currentPlayer?: 'player' | 'opponent';
  fieldState?: Record<string, unknown>;
}

const MONSTER_ZONES: FieldZoneType[] = ['monster1', 'monster2', 'monster3', 'monster4', 'monster5'];
const EXTRA_MONSTER_ZONES: FieldZoneType[] = ['extraMonster1', 'extraMonster2'];
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

const isFieldSpell = (type: string, race?: string): boolean => {
  return type === 'Spell Card' && race === 'Field';
};

export const ZonePlacementModal = ({
  open,
  onClose,
  card,
  onPlaceCard,
  occupiedZones,
  fromZone = 'hand',
  currentPlayer = 'player',
  fieldState,
}: ZonePlacementModalProps) => {
  const gameState = useGameState();
  
  if (!card) return null;
  const isMonster = isMonsterCard(card.type);
  const isSpell = isSpellCard(card.type);
  const isTrap = isTrapCard(card.type);
  const isField = isFieldSpell(card.type, card.race);
  const isExtraDeck = isExtraDeckCardType(card.type);
  const isLinkMonster = card.type.includes('Link');

  // Check if this is a valid move based on game rules
  const isValidPlacement = (zone: FieldZoneType, faceDown: boolean, position: 'attack' | 'defense'): boolean => {
    // Basic zone compatibility
    if (!canPlaceInZone(card, zone, fromZone)) return false;

    // Check summoning rules for monster zones
    if (zone.startsWith('monster') || zone.startsWith('extraMonster')) {
      // Normal summon/set from hand
      if (fromZone === 'hand') {
        if (faceDown) {
          return canNormalSet(card, fromZone, currentPlayer);
        } else {
          return canNormalSummon(card, fromZone, currentPlayer);
        }
      }
      
      // Special summon from other zones
      return canSpecialSummon(card, fromZone, currentPlayer);
    }

    // Spell/Trap activation rules
    if (zone.startsWith('spell') || zone === 'fieldSpell') {
      if (faceDown) {
        // Setting spells/traps is generally allowed
        return gameState.currentPhase === 'main1' || gameState.currentPhase === 'main2';
      } else {
        // Activation requires specific conditions
        return gameState.turnPlayer === currentPlayer;
      }
    }

    return true;
  };

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

  const getRequiredTributesForCard = (): number => {
    return getRequiredTributes(card, currentPlayer);
  };

  const getAvailableTributes = (): GameCard[] => {
    const tributes: GameCard[] = [];
    
    // Get monsters from field
    for (let i = 1; i <= 5; i++) {
      const monster = fieldState?.[`monster${i}`] as GameCard | undefined;
      if (monster && monster.instanceId !== card.instanceId) {
        tributes.push(monster);
      }
    }
    
    return tributes;
  };

  const handlePlace = (zone: FieldZoneType, faceDown: boolean, position: 'attack' | 'defense') => {
    // Check if placement is valid
    if (!isValidPlacement(zone, faceDown, position)) {
      return;
    }

    // Check for tribute requirements
    const requiredTributes = getRequiredTributesForCard();
    if (requiredTributes > 0 && fromZone === 'hand' && !faceDown) {
      // Would need to show tribute selection modal here
      // For now, we'll proceed but this should be handled
      console.log(`Requires ${requiredTributes} tributes`);
    }

    // Update game state for normal summons/sets
    if (fromZone === 'hand' && zone.startsWith('monster')) {
      if (faceDown) {
        gameState.recordNormalSet(currentPlayer);
      } else {
        gameState.recordNormalSummon(currentPlayer);
      }
    }

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
              
              {/* Game state warnings */}
              {gameState.turnPlayer !== currentPlayer && (
                <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 p-2 rounded">
                  <AlertTriangle className="h-3 w-3" />
                  Não é seu turno
                </div>
              )}
              
              {fromZone === 'hand' && isMonster && !['main1', 'main2'].includes(gameState.currentPhase) && (
                <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 p-2 rounded">
                  <AlertTriangle className="h-3 w-3" />
                  Só pode invocar na Fase Principal
                </div>
              )}
              
              {fromZone === 'hand' && isMonster && gameState.currentPhase === 'main1' && 
               gameState.playerSummonState.hasNormalSummoned && !isExtraDeck && (
                <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 p-2 rounded">
                  <AlertTriangle className="h-3 w-3" />
                  Já usou sua Invocação Normal deste turno
                </div>
              )}
              
              {getRequiredTributesForCard() > 0 && fromZone === 'hand' && !isExtraDeck && (
                <div className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 p-2 rounded">
                  <AlertTriangle className="h-3 w-3" />
                  Requer {getRequiredTributesForCard()} tributo(s)
                </div>
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
                    {getAvailableMonsterZones().map((zone) => {
                      const isValid = isValidPlacement(zone, false, 'attack');
                      return (
                        <Button
                          key={zone}
                          variant={isValid ? "outline" : "secondary"}
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => handlePlace(zone, false, 'attack')}
                          disabled={!isValid}
                        >
                          {zone.includes('extra') ? 'EMZ' : `M${MONSTER_ZONES.indexOf(zone as FieldZoneType) + 1}`}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                {/* Defense Position (Face-up) - Not for Link monsters */}
                {!isLinkMonster && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Shield className="h-3 w-3" /> Posição de Defesa (Face para cima)
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {getAvailableMonsterZones().filter(z => !z.includes('extra')).map((zone) => {
                        const isValid = isValidPlacement(zone, false, 'defense');
                        return (
                          <Button
                            key={zone}
                            variant={isValid ? "outline" : "secondary"}
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => handlePlace(zone, false, 'defense')}
                            disabled={!isValid}
                          >
                            M{MONSTER_ZONES.indexOf(zone as FieldZoneType) + 1}
                          </Button>
                        );
                      })}
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
                      {getAvailableMonsterZones().filter(z => !z.includes('extra')).map((zone) => {
                        const isValid = isValidPlacement(zone, true, 'defense');
                        return (
                          <Button
                            key={zone}
                            variant={isValid ? "secondary" : "outline"}
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => handlePlace(zone, true, 'defense')}
                            disabled={!isValid}
                          >
                            M{MONSTER_ZONES.indexOf(zone as FieldZoneType) + 1}
                          </Button>
                        );
                      })}
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
                    {getAvailableSpellTrapZones().map((zone) => {
                      const isValid = isValidPlacement(zone, false, 'attack');
                      return (
                        <Button
                          key={zone}
                          variant={isValid ? "outline" : "secondary"}
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => handlePlace(zone, false, 'attack')}
                          disabled={!isValid}
                        >
                          S/T{SPELL_TRAP_ZONES.indexOf(zone as FieldZoneType) + 1}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                {/* Set (Face-down) */}
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <EyeOff className="h-3 w-3" /> Setar (Face para baixo)
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {getAvailableSpellTrapZones().map((zone) => {
                      const isValid = isValidPlacement(zone, true, 'attack');
                      return (
                        <Button
                          key={zone}
                          variant={isValid ? "secondary" : "outline"}
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => handlePlace(zone, true, 'attack')}
                          disabled={!isValid}
                        >
                          S/T{SPELL_TRAP_ZONES.indexOf(zone as FieldZoneType) + 1}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Warning messages */}
            {getAvailableMonsterZones().length === 0 && getAvailableSpellTrapZones().length === 0 && (
              <p className="text-xs text-destructive">Todas as zonas estão ocupadas!</p>
            )}
            
            {/* Special summon hint for extra deck cards */}
            {isExtraDeck && fromZone === 'extraDeck' && (
              <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded">
                <Sparkles className="h-3 w-3 inline mr-1" />
                Monstros do Extra Deck requerem Invocação Especial
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
