import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useGameState, GamePhase, TurnPlayer } from '@/store/gameState';
import { Play, SkipForward, RotateCcw, Sword } from 'lucide-react';

export const PhaseControl: React.FC = () => {
  const { 
    currentPhase, 
    turnPlayer, 
    turnCount, 
    setPhase, 
    nextTurn,
    playerSummonState,
    opponentSummonState
  } = useGameState();

  const phases: { value: GamePhase; label: string; icon: React.ReactNode }[] = [
    { value: 'draw', label: 'Draw', icon: <Play className="h-4 w-4" /> },
    { value: 'standby', label: 'Standby', icon: <SkipForward className="h-4 w-4" /> },
    { value: 'main1', label: 'Main 1', icon: <Sword className="h-4 w-4" /> },
    { value: 'battle', label: 'Battle', icon: <Sword className="h-4 w-4" /> },
    { value: 'main2', label: 'Main 2', icon: <Sword className="h-4 w-4" /> },
    { value: 'end', label: 'End', icon: <RotateCcw className="h-4 w-4" /> },
  ];

  const getCurrentPhaseIndex = () => {
    return phases.findIndex(p => p.value === currentPhase);
  };

  const canAdvancePhase = () => {
    const currentIndex = getCurrentPhaseIndex();
    return currentIndex < phases.length - 1;
  };

  const advancePhase = () => {
    if (canAdvancePhase()) {
      const currentIndex = getCurrentPhaseIndex();
      setPhase(phases[currentIndex + 1].value);
    } else {
      nextTurn();
    }
  };

  const getPhaseColor = (phase: GamePhase) => {
    if (phase === currentPhase) return 'default';
    if (phase === 'battle') return 'destructive';
    if (phase === 'main1' || phase === 'main2') return 'secondary';
    return 'outline';
  };

  const getSummonState = (player: TurnPlayer) => {
    const state = player === 'player' ? playerSummonState : opponentSummonState;
    return state;
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Controle de Fases</span>
          <Badge variant={turnPlayer === 'player' ? 'default' : 'secondary'}>
            {turnPlayer === 'player' ? 'Player' : 'Opponent'} - Turn {turnCount}
          </Badge>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Phase Display */}
        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground">Fase Atual:</div>
          <div className="flex items-center gap-2">
            {phases[getCurrentPhaseIndex()].icon}
            <Badge variant={getPhaseColor(currentPhase)} className="text-sm px-3 py-1">
              {phases[getCurrentPhaseIndex()].label}
            </Badge>
          </div>
        </div>

        {/* Phase Navigation */}
        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground">Navegação de Fases:</div>
          <div className="grid grid-cols-3 gap-2">
            {phases.map((phase) => (
              <Button
                key={phase.value}
                variant={phase.value === currentPhase ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPhase(phase.value)}
                className="flex items-center gap-1 text-xs"
                disabled={turnPlayer !== 'player'}
              >
                {phase.icon}
                {phase.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2">
          <Button
            onClick={advancePhase}
            disabled={!canAdvancePhase() || turnPlayer !== 'player'}
            className="flex-1"
          >
            {canAdvancePhase() ? 'Próxima Fase' : 'End Turn'}
          </Button>
          <Button
            onClick={nextTurn}
            variant="outline"
            disabled={turnPlayer !== 'player'}
          >
            End Turn
          </Button>
        </div>

        {/* Summon State */}
        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground">Estado de Invocação:</div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span>Normal Summon:</span>
              <Badge variant={getSummonState(turnPlayer).hasNormalSummoned ? 'secondary' : 'outline'}>
                {getSummonState(turnPlayer).hasNormalSummoned ? 'Used' : 'Available'}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span>Normal Set:</span>
              <Badge variant={getSummonState(turnPlayer).hasNormalSet ? 'secondary' : 'outline'}>
                {getSummonState(turnPlayer).hasNormalSet ? 'Used' : 'Available'}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span>Special Summon:</span>
              <Badge variant={getSummonState(turnPlayer).canSpecialSummon ? 'default' : 'secondary'}>
                {getSummonState(turnPlayer).canSpecialSummon ? 'Available' : 'Limited'}
              </Badge>
            </div>
          </div>
        </div>

        {/* Turn Info */}
        <div className="text-xs text-muted-foreground border-t pt-2">
          <div className="space-y-1">
            <div>Turn: {turnCount}</div>
            <div>Current Player: {turnPlayer === 'player' ? 'You' : 'Opponent'}</div>
            <div>Phase: {currentPhase}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};