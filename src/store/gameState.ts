import { create } from 'zustand';
import { GameCard } from '../types/game';

export type GamePhase = 'draw' | 'standby' | 'main1' | 'battle' | 'main2' | 'end';
export type TurnPlayer = 'player' | 'opponent';

export interface SummonState {
  hasNormalSummoned: boolean;
  hasNormalSet: boolean;
  normalSummonCount: number;
  tributeCount: number;
  canSpecialSummon: boolean;
}

export interface GameState {
  currentPhase: GamePhase;
  turnPlayer: TurnPlayer;
  turnCount: number;
  playerSummonState: SummonState;
  opponentSummonState: SummonState;
  chainStack: Array<{
    card: GameCard;
    player: TurnPlayer;
    effect: string;
  }>;
}

interface GameActions {
  setPhase: (phase: GamePhase) => void;
  nextTurn: () => void;
  resetSummonState: (player: TurnPlayer) => void;
  recordNormalSummon: (player: TurnPlayer) => void;
  recordNormalSet: (player: TurnPlayer) => void;
  canNormalSummon: (player: TurnPlayer) => boolean;
  canNormalSet: (player: TurnPlayer) => boolean;
  getRequiredTributes: (card: GameCard, player: TurnPlayer) => number;
  addToChain: (card: GameCard, player: TurnPlayer, effect: string) => void;
  resolveChain: () => void;
}

export const useGameState = create<GameState & GameActions>((set, get) => ({
  currentPhase: 'draw',
  turnPlayer: 'player',
  turnCount: 1,
  playerSummonState: {
    hasNormalSummoned: false,
    hasNormalSet: false,
    normalSummonCount: 0,
    tributeCount: 0,
    canSpecialSummon: true,
  },
  opponentSummonState: {
    hasNormalSummoned: false,
    hasNormalSet: false,
    normalSummonCount: 0,
    tributeCount: 0,
    canSpecialSummon: true,
  },
  chainStack: [],

  setPhase: (phase) => set({ currentPhase: phase }),

  nextTurn: () => set((state) => ({
    turnPlayer: state.turnPlayer === 'player' ? 'opponent' : 'player',
    turnCount: state.turnPlayer === 'opponent' ? state.turnCount + 1 : state.turnCount,
    currentPhase: 'draw',
    playerSummonState: state.turnPlayer === 'player' ? {
      hasNormalSummoned: false,
      hasNormalSet: false,
      normalSummonCount: 0,
      tributeCount: 0,
      canSpecialSummon: true,
    } : state.playerSummonState,
    opponentSummonState: state.turnPlayer === 'opponent' ? {
      hasNormalSummoned: false,
      hasNormalSet: false,
      normalSummonCount: 0,
      tributeCount: 0,
      canSpecialSummon: true,
    } : state.opponentSummonState,
  })),

  resetSummonState: (player) => set((state) => ({
    [player === 'player' ? 'playerSummonState' : 'opponentSummonState']: {
      hasNormalSummoned: false,
      hasNormalSet: false,
      normalSummonCount: 0,
      tributeCount: 0,
      canSpecialSummon: true,
    }
  })),

  recordNormalSummon: (player) => set((state) => {
    const summonState = player === 'player' ? state.playerSummonState : state.opponentSummonState;
    return {
      [player === 'player' ? 'playerSummonState' : 'opponentSummonState']: {
        ...summonState,
        hasNormalSummoned: true,
        normalSummonCount: summonState.normalSummonCount + 1,
      }
    };
  }),

  recordNormalSet: (player) => set((state) => {
    const summonState = player === 'player' ? state.playerSummonState : state.opponentSummonState;
    return {
      [player === 'player' ? 'playerSummonState' : 'opponentSummonState']: {
        ...summonState,
        hasNormalSet: true,
        normalSummonCount: summonState.normalSummonCount + 1,
      }
    };
  }),

  canNormalSummon: (player) => {
    const state = get();
    const summonState = player === 'player' ? state.playerSummonState : state.opponentSummonState;
    const isInMainPhase = state.currentPhase === 'main1' || state.currentPhase === 'main2';
    return isInMainPhase && !summonState.hasNormalSummoned && state.turnPlayer === player;
  },

  canNormalSet: (player) => {
    const state = get();
    const summonState = player === 'player' ? state.playerSummonState : state.opponentSummonState;
    const isInMainPhase = state.currentPhase === 'main1' || state.currentPhase === 'main2';
    return isInMainPhase && !summonState.hasNormalSet && state.turnPlayer === player;
  },

  getRequiredTributes: (card, player) => {
    const state = get();
    const summonState = player === 'player' ? state.playerSummonState : state.opponentSummonState;
    
    if (!card.level) return 0;
    
    // Check for special conditions (like "no tribute needed" effects)
    if (summonState.canSpecialSummon) return 0;
    
    if (card.level >= 7) return 2;
    if (card.level >= 5) return 1;
    return 0;
  },

  addToChain: (card, player, effect) => set((state) => ({
    chainStack: [...state.chainStack, { card, player, effect }]
  })),

  resolveChain: () => set({ chainStack: [] }),
}));