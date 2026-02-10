import { useState, useCallback } from 'react';
import { GameCard, FieldZoneType } from '@/components/duel/DuelFieldBoard';
import { useGameState } from '@/store/gameState';
import { 
  canPlaceInZone, 
  canNormalSummon, 
  canNormalSet, 
  canSpecialSummon,
  getRequiredTributes
} from '../utils/cardValidation';

export const useFieldManager = (initialFieldState: Record<string, GameCard | GameCard[] | null>) => {
  const [fieldState, setFieldState] = useState(initialFieldState);
  const gameState = useGameState();

  const placeCard = useCallback((
    card: GameCard, 
    targetZone: FieldZoneType, 
    faceDown: boolean = false, 
    position: 'attack' | 'defense' = 'attack',
    fromZone: FieldZoneType = 'hand'
  ) => {
    // Validate placement
    if (!canPlaceInZone(card, targetZone, fromZone)) {
      throw new Error(`Cannot place ${card.name} in ${targetZone}`);
    }

    // Check game rules for monster zones
    if (targetZone.startsWith('monster') || targetZone.startsWith('extraMonster')) {
      if (fromZone === 'hand') {
        if (faceDown) {
          if (!canNormalSet(card, fromZone, 'player')) {
            throw new Error('Cannot normal set this card');
          }
          gameState.recordNormalSet('player');
        } else {
          if (!canNormalSummon(card, fromZone, 'player')) {
            throw new Error('Cannot normal summon this card');
          }
          gameState.recordNormalSummon('player');
        }
      } else {
        if (!canSpecialSummon(card, fromZone, 'player')) {
          throw new Error('Cannot special summon this card');
        }
      }
    }

    // Update card properties
    const updatedCard: GameCard = {
      ...card,
      isFaceDown: faceDown,
      position: position,
    };

    // Update field state
    setFieldState(prev => {
      const newState = { ...prev };
      
      // Remove card from source zone if it's a pile
      if (['hand', 'deck', 'extraDeck', 'graveyard', 'banished'].includes(fromZone)) {
        const sourceArray = newState[fromZone] as GameCard[];
        newState[fromZone] = sourceArray.filter(c => c.instanceId !== card.instanceId);
      }
      
      // Place card in target zone
      if (['monster1', 'monster2', 'monster3', 'monster4', 'monster5', 
           'extraMonster1', 'extraMonster2', 'spell1', 'spell2', 'spell3', 
           'spell4', 'spell5', 'fieldSpell'].includes(targetZone)) {
        newState[targetZone] = updatedCard;
      } else if (['hand', 'deck', 'extraDeck', 'graveyard', 'banished'].includes(targetZone)) {
        const targetArray = newState[targetZone] as GameCard[];
        newState[targetZone] = [...targetArray, updatedCard];
      }
      
      return newState;
    });
  }, [gameState]);

  const moveCard = useCallback((
    card: GameCard,
    fromZone: FieldZoneType,
    toZone: FieldZoneType,
    options: {
      faceDown?: boolean;
      position?: 'attack' | 'defense';
      shuffle?: boolean;
    } = {}
  ) => {
    setFieldState(prev => {
      const newState = { ...prev };
      
      // Remove from source zone
      if (['monster1', 'monster2', 'monster3', 'monster4', 'monster5', 
           'extraMonster1', 'extraMonster2', 'spell1', 'spell2', 'spell3', 
           'spell4', 'spell5', 'fieldSpell'].includes(fromZone)) {
        newState[fromZone] = null;
      } else if (['hand', 'deck', 'extraDeck', 'graveyard', 'banished'].includes(fromZone)) {
        const sourceArray = newState[fromZone] as GameCard[];
        newState[fromZone] = sourceArray.filter(c => c.instanceId !== card.instanceId);
      }
      
      // Add to destination zone
      const updatedCard: GameCard = {
        ...card,
        isFaceDown: options.faceDown ?? card.isFaceDown,
        position: options.position ?? card.position,
      };
      
      if (['monster1', 'monster2', 'monster3', 'monster4', 'monster5', 
           'extraMonster1', 'extraMonster2', 'spell1', 'spell2', 'spell3', 
           'spell4', 'spell5', 'fieldSpell'].includes(toZone)) {
        newState[toZone] = updatedCard;
      } else if (['hand', 'deck', 'extraDeck', 'graveyard', 'banished'].includes(toZone)) {
        let targetArray = newState[toZone] as GameCard[];
        
        if (options.shuffle && toZone === 'deck') {
          // Add to random position in deck
          const randomIndex = Math.floor(Math.random() * (targetArray.length + 1));
          targetArray = [...targetArray];
          targetArray.splice(randomIndex, 0, updatedCard);
        } else {
          // Add to top/bottom
          targetArray = [...targetArray, updatedCard];
        }
        
        newState[toZone] = targetArray;
      }
      
      return newState;
    });
  }, []);

  const tributeMonster = useCallback((monster: GameCard) => {
    setFieldState(prev => {
      const newState = { ...prev };
      
      // Find and remove the monster from field
      for (let i = 1; i <= 5; i++) {
        const zone = `monster${i}` as FieldZoneType;
        const zoneContent = newState[zone];
        if (zoneContent && !Array.isArray(zoneContent) && (zoneContent as GameCard).instanceId === monster.instanceId) {
          newState[zone] = null;
          break;
        }
      }
      
      // Add to graveyard
      const graveyard = newState.graveyard as GameCard[];
      newState.graveyard = [...graveyard, monster];
      
      return newState;
    });
  }, []);

  const getAvailableMonsterZones = useCallback((): FieldZoneType[] => {
    const zones: FieldZoneType[] = [];
    
    for (let i = 1; i <= 5; i++) {
      const zone = `monster${i}` as FieldZoneType;
      if (!fieldState[zone]) {
        zones.push(zone);
      }
    }
    
    return zones;
  }, [fieldState]);

  const getAvailableSpellTrapZones = useCallback((): FieldZoneType[] => {
    const zones: FieldZoneType[] = [];
    
    for (let i = 1; i <= 5; i++) {
      const zone = `spell${i}` as FieldZoneType;
      if (!fieldState[zone]) {
        zones.push(zone);
      }
    }
    
    if (!fieldState.fieldSpell) {
      zones.push('fieldSpell');
    }
    
    return zones;
  }, [fieldState]);

  const getMonstersOnField = useCallback((): GameCard[] => {
    const monsters: GameCard[] = [];
    
    for (let i = 1; i <= 5; i++) {
      const zone = `monster${i}` as FieldZoneType;
      const monster = fieldState[zone] as GameCard;
      if (monster) {
        monsters.push(monster);
      }
    }
    
    return monsters;
  }, [fieldState]);

  const getRequiredTributesForCard = useCallback((card: GameCard): number => {
    return getRequiredTributes(card, 'player');
  }, []);

  return {
    fieldState,
    placeCard,
    moveCard,
    tributeMonster,
    getAvailableMonsterZones,
    getAvailableSpellTrapZones,
    getMonstersOnField,
    getRequiredTributesForCard,
  };
};