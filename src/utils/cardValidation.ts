import { GameCard, FieldZoneType } from '@/components/duel/DuelFieldBoard';
import { useGameState } from '@/store/gameState';

export const isMonsterCard = (type: string): boolean => {
  if (isSpellCard(type) || isTrapCard(type)) return false;
  return type.toLowerCase().includes('monster');
};

export const isSpellCard = (type: string): boolean => {
  return type.toLowerCase().includes('spell');
};

export const isTrapCard = (type: string): boolean => {
  return type.toLowerCase().includes('trap');
};

export const isExtraDeckCardType = (type: string): boolean => {
  const extraTypes = ['fusion', 'synchro', 'xyz', 'link'];
  return extraTypes.some(t => type.toLowerCase().includes(t));
};

export const isFieldSpell = (type: string, race?: string): boolean => {
  return isSpellCard(type) && race?.toLowerCase() === 'field';
};

export const isRitualMonster = (type: string): boolean => {
  return type.toLowerCase().includes('ritual') && isMonsterCard(type);
};

export const isPendulumMonster = (type: string): boolean => {
  return type.toLowerCase().includes('pendulum');
};

export const getCardCategory = (card: GameCard): 'monster' | 'spell' | 'trap' => {
  if (isMonsterCard(card.type)) return 'monster';
  if (isSpellCard(card.type)) return 'spell';
  if (isTrapCard(card.type)) return 'trap';
  return 'monster'; // fallback
};

export const canPlaceInZone = (card: GameCard, zone: FieldZoneType, fromZone?: FieldZoneType): boolean => {
  const cardCategory = getCardCategory(card);
  
  // Monster zones
  if (zone.startsWith('monster') || zone.startsWith('extraMonster')) {
    if (cardCategory !== 'monster') return false;
    
    // Extra deck monsters can only go to extra monster zones
    if (isExtraDeckCardType(card.type)) {
      return zone.startsWith('extraMonster');
    }
    
    // Regular monsters can only go to regular monster zones
    return zone.startsWith('monster') && !zone.startsWith('extraMonster');
  }
  
  // Spell/Trap zones
  if (zone.startsWith('spell') || zone === 'fieldSpell') {
    if (zone === 'fieldSpell') {
      return isFieldSpell(card.type, card.race);
    }
    return cardCategory === 'spell' || cardCategory === 'trap';
  }
  
  // Pile zones (deck, graveyard, banished, extra deck)
  if (['deck', 'extraDeck', 'graveyard', 'banished', 'sideDeck'].includes(zone)) {
    // Cards can always be sent to these zones
    return true;
  }
  
  // Hand
  if (zone === 'hand') {
    // Cards can only be added to hand from deck or extra deck
    return ['deck', 'extraDeck'].includes(fromZone || '');
  }
  
  return false;
};

export const getAvailableZonesForCard = (card: GameCard, fromZone?: FieldZoneType): FieldZoneType[] => {
  const allZones: FieldZoneType[] = [
    'monster1', 'monster2', 'monster3', 'monster4', 'monster5',
    'extraMonster1', 'extraMonster2',
    'spell1', 'spell2', 'spell3', 'spell4', 'spell5',
    'fieldSpell',
    'deck', 'extraDeck', 'graveyard', 'banished', 'sideDeck',
    'hand'
  ];
  
  return allZones.filter(zone => canPlaceInZone(card, zone, fromZone));
};

export const canSummonFromZone = (card: GameCard, fromZone: FieldZoneType, player: 'player' | 'opponent'): boolean => {
  const gameState = useGameState.getState();
  
  // Can only summon during your turn
  if (gameState.turnPlayer !== player) return false;
  
  // Can only summon during main phases
  if (!['main1', 'main2'].includes(gameState.currentPhase)) return false;
  
  const cardCategory = getCardCategory(card);
  
  // Only monsters can be summoned
  if (cardCategory !== 'monster') return false;
  
  // Check if it's a normal summon from hand
  if (fromZone === 'hand') {
    return gameState.canNormalSummon(player);
  }
  
  // Special summons from other zones
  if (['deck', 'graveyard', 'banished', 'extraDeck'].includes(fromZone)) {
    return gameState.playerSummonState.canSpecialSummon;
  }
  
  return false;
};

export const canActivateFromZone = (card: GameCard, fromZone: FieldZoneType, player: 'player' | 'opponent'): boolean => {
  const gameState = useGameState.getState();
  
  // Can only activate during your turn (unless it's a trap)
  if (gameState.turnPlayer !== player && !isTrapCard(card.type)) return false;
  
  const cardCategory = getCardCategory(card);
  
  // Spell cards can be activated from hand
  if (fromZone === 'hand' && cardCategory === 'spell') {
    return ['main1', 'main2'].includes(gameState.currentPhase);
  }
  
  // Trap cards can only be activated from set spell/trap zones
  if (isTrapCard(card.type)) {
    return fromZone.startsWith('spell') && gameState.currentPhase !== 'draw';
  }
  
  // Monster effects can be activated from various zones
  if (cardCategory === 'monster') {
    return ['hand', 'field', 'graveyard', 'banished'].includes(fromZone) && 
           ['main1', 'main2', 'battle'].includes(gameState.currentPhase);
  }
  
  return false;
};

export const getRequiredTributes = (card: GameCard, player: 'player' | 'opponent'): number => {
  if (!card.level || !isMonsterCard(card.type)) return 0;
  
  // Ritual monsters always require tributes equal to their level
  if (isRitualMonster(card.type)) {
    return Math.floor(card.level / 2);
  }
  
  // Normal tribute requirements
  if (card.level >= 7) return 2;
  if (card.level >= 5) return 1;
  return 0;
};

export const canNormalSummon = (card: GameCard, fromZone: FieldZoneType, player: 'player' | 'opponent'): boolean => {
  const gameState = useGameState.getState();
  
  // Must be from hand
  if (fromZone !== 'hand') return false;
  
  // Must be your turn and main phase
  if (gameState.turnPlayer !== player) return false;
  if (!['main1', 'main2'].includes(gameState.currentPhase)) return false;
  
  // Must be a monster
  if (!isMonsterCard(card.type)) return false;
  
  // Cannot be extra deck monster (requires special summon)
  if (isExtraDeckCardType(card.type)) return false;
  
  // Must not have already normal summoned
  if (!gameState.canNormalSummon(player)) return false;
  
  return true;
};

export const canNormalSet = (card: GameCard, fromZone: FieldZoneType, player: 'player' | 'opponent'): boolean => {
  const gameState = useGameState.getState();
  
  // Must be from hand
  if (fromZone !== 'hand') return false;
  
  // Must be your turn and main phase
  if (gameState.turnPlayer !== player) return false;
  if (!['main1', 'main2'].includes(gameState.currentPhase)) return false;
  
  // Must not have already normal set
  if (!gameState.canNormalSet(player)) return false;
  
  // Monsters can be set
  if (isMonsterCard(card.type)) {
    // Cannot be extra deck monster
    return !isExtraDeckCardType(card.type);
  }
  
  // Spell cards can be set
  if (isSpellCard(card.type)) {
    return true;
  }
  
  // Trap cards can be set
  if (isTrapCard(card.type)) {
    return true;
  }
  
  return false;
};

export const canSpecialSummon = (card: GameCard, fromZone: FieldZoneType, player: 'player' | 'opponent'): boolean => {
  const gameState = useGameState.getState();
  
  // Must be your turn (unless it's an opponent's effect)
  if (gameState.turnPlayer !== player) return false;
  
  // Must be a monster
  if (!isMonsterCard(card.type)) return false;
  
  // Extra deck monsters can only be special summoned from extra deck
  if (isExtraDeckCardType(card.type)) {
    return fromZone === 'extraDeck';
  }
  
  // Other monsters can be special summoned from various zones
  return ['deck', 'graveyard', 'banished', 'hand'].includes(fromZone);
};