/**
 * DuelVerse - Calculadora de LP Flutuante
 * Suporte para 2-4 jogadores + contadores customizados públicos
 */
import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Heart, Shield, Minus, Plus, GripVertical, X, Maximize2, Minimize2, RotateCcw, PlusCircle, Trash2 } from "lucide-react";
import { useDuelLayoutConfig } from "@/hooks/useDuelLayoutConfig";

type PlayerKey = 'player1' | 'player2' | 'player3' | 'player4';

interface CustomCounter {
  id: string;
  name: string;
  value: number;
}

interface PlayerInfo {
  key: PlayerKey;
  name: string;
  lp: number;
  color: string;
}

interface FloatingCalculatorProps {
  player1Name: string;
  player2Name: string;
  player1LP: number;
  player2LP: number;
  player3Name?: string;
  player4Name?: string;
  player3LP?: number;
  player4LP?: number;
  maxPlayers?: number;
  onUpdateLP: (player: PlayerKey, amount: number) => void;
  onSetLP: (player: PlayerKey, value: number) => void;
  currentUserPlayer?: PlayerKey | null;
  onClose?: () => void;
  tcgType?: string;
  customCounters?: CustomCounter[];
  onUpdateCustomCounter?: (id: string, value: number) => void;
  onAddCustomCounter?: (name: string, startValue: number) => void;
  onRemoveCustomCounter?: (id: string) => void;
}

export const FloatingCalculator = ({
  player1Name,
  player2Name,
  player1LP,
  player2LP,
  player3Name,
  player4Name,
  player3LP = 0,
  player4LP = 0,
  maxPlayers = 2,
  onUpdateLP,
  onSetLP,
  currentUserPlayer = null,
  onClose,
  tcgType = 'yugioh',
  customCounters = [],
  onUpdateCustomCounter,
  onAddCustomCounter,
  onRemoveCustomCounter,
}: FloatingCalculatorProps) => {
  const { getPosition } = useDuelLayoutConfig();
  const isMagic = tcgType === 'magic';
  const isPokemon = tcgType === 'pokemon';
  const defaultLP = isPokemon ? 6 : isMagic ? 40 : 8000;
  const lpButtons = isPokemon
    ? { row1: [{ label: '-2', amount: -2 }, { label: '-1', amount: -1 }, { label: '+1', amount: 1 }, { label: '+2', amount: 2 }] }
    : isMagic
    ? { row1: [{ label: '-5', amount: -5 }, { label: '-1', amount: -1 }, { label: '+1', amount: 1 }, { label: '+5', amount: 5 }] }
    : { row1: [{ label: '-1k', amount: -1000 }, { label: '-500', amount: -500 }, { label: '+500', amount: 500 }, { label: '+1k', amount: 1000 }] };
  const lpButtonsRow2 = isPokemon
    ? []
    : isMagic
    ? [{ label: '-10', amount: -10 }, { label: '+10', amount: 10 }]
    : [{ label: '-100', amount: -100 }, { label: '+100', amount: 100 }];

  const [position, setPosition] = useState(() => {
    return getPosition("calculator");
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const calculatorRef = useRef<HTMLDivElement>(null);

  const [editingPlayer, setEditingPlayer] = useState<PlayerKey | null>(null);
  const [tempLP, setTempLP] = useState<Record<PlayerKey, string>>({
    player1: player1LP.toString(),
    player2: player2LP.toString(),
    player3: player3LP.toString(),
    player4: player4LP.toString(),
  });

  // Custom counter add form
  const [showAddCounter, setShowAddCounter] = useState(false);
  const [newCounterName, setNewCounterName] = useState('');
  const [newCounterValue, setNewCounterValue] = useState('20');

  useEffect(() => { setTempLP(prev => ({ ...prev, player1: player1LP.toString() })); }, [player1LP]);
  useEffect(() => { setTempLP(prev => ({ ...prev, player2: player2LP.toString() })); }, [player2LP]);
  useEffect(() => { setTempLP(prev => ({ ...prev, player3: player3LP.toString() })); }, [player3LP]);
  useEffect(() => { setTempLP(prev => ({ ...prev, player4: player4LP.toString() })); }, [player4LP]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input')) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('button, input')) return;
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({ x: touch.clientX - position.x, y: touch.clientY - position.y });
  };

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: MouseEvent) => setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      setPosition({ x: touch.clientX - dragStart.x, y: touch.clientY - dragStart.y });
    };
    const handleUp = () => setIsDragging(false);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleUp);
    };
  }, [isDragging, dragStart]);

  const handleLPSubmit = (player: PlayerKey, currentLP: number) => {
    const value = parseInt(tempLP[player]);
    if (!isNaN(value) && value >= 0) {
      onSetLP(player, value);
    } else {
      setTempLP(prev => ({ ...prev, [player]: currentLP.toString() }));
    }
    setEditingPlayer(null);
  };

  const handleAddCounter = () => {
    if (!newCounterName.trim() || !onAddCustomCounter) return;
    const startVal = parseInt(newCounterValue) || 20;
    onAddCustomCounter(newCounterName.trim(), startVal);
    setNewCounterName('');
    setNewCounterValue('20');
    setShowAddCounter(false);
  };

  // Build players list
  const players: PlayerInfo[] = [
    { key: 'player1', name: player1Name, lp: player1LP, color: 'text-primary' },
    { key: 'player2', name: player2Name, lp: player2LP, color: 'text-accent' },
  ];
  if (maxPlayers >= 3 && player3Name) {
    players.push({ key: 'player3', name: player3Name, lp: player3LP, color: 'text-green-500' });
  }
  if (maxPlayers >= 4 && player4Name) {
    players.push({ key: 'player4', name: player4Name, lp: player4LP, color: 'text-yellow-500' });
  }

  const renderPlayerSection = (player: PlayerInfo) => {
    const isCurrentUser = currentUserPlayer === player.key;
    const isEditing = editingPlayer === player.key;

    return (
      <div key={player.key} className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 sm:gap-2">
            <Shield className={`w-3 h-3 sm:w-4 sm:h-4 ${player.color}`} />
            <span className="text-xs sm:text-sm font-semibold truncate max-w-[80px] sm:max-w-none">{player.name}</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <Heart className="w-3 h-3 sm:w-4 sm:h-4 text-destructive" />
            {isEditing && isCurrentUser ? (
              <Input
                type="number"
                value={tempLP[player.key]}
                onChange={(e) => setTempLP(prev => ({ ...prev, [player.key]: e.target.value }))}
                onBlur={() => handleLPSubmit(player.key, player.lp)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleLPSubmit(player.key, player.lp);
                  if (e.key === 'Escape') {
                    setTempLP(prev => ({ ...prev, [player.key]: player.lp.toString() }));
                    setEditingPlayer(null);
                  }
                }}
                className="w-24 h-8 text-right text-lg font-bold"
                autoFocus
              />
            ) : (
              <span
                className={`text-lg sm:text-xl font-bold text-gradient-mystic ${isCurrentUser ? 'cursor-pointer hover:opacity-80' : ''}`}
                onClick={() => isCurrentUser && setEditingPlayer(player.key)}
              >
                {player.lp}
              </span>
            )}
          </div>
        </div>
        
        {isCurrentUser && (
          <>
            <div className="grid grid-cols-4 gap-2">
              {lpButtons.row1.map(btn => (
                <Button key={btn.label} size="sm" variant="outline" onClick={() => onUpdateLP(player.key, btn.amount)} className="text-xs">
                  {btn.amount < 0 ? <Minus className="w-3 h-3 mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
                  {btn.label.replace(/^[+-]/, '')}
                </Button>
              ))}
            </div>
            {lpButtonsRow2.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {lpButtonsRow2.map(btn => (
                  <Button key={btn.label} size="sm" variant="outline" onClick={() => onUpdateLP(player.key, btn.amount)} className="text-xs">
                    {btn.amount < 0 ? <Minus className="w-3 h-3 mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
                    {btn.label.replace(/^[+-]/, '')}
                  </Button>
                ))}
                <Button size="sm" variant="destructive" onClick={() => onSetLP(player.key, defaultLP)} className="text-xs" title={`Resetar LP para ${defaultLP}`}>
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Reset
                </Button>
              </div>
            ) : (
              <div className="flex justify-end">
                <Button size="sm" variant="destructive" onClick={() => onSetLP(player.key, defaultLP)} className="text-xs" title={`Resetar para ${defaultLP}`}>
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Reset
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div
      ref={calculatorRef}
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 1000,
        cursor: isDragging ? 'grabbing' : 'default',
      }}
      className="select-none"
    >
      <Card className="card-mystic backdrop-blur-md bg-card/95 shadow-2xl border-2 border-primary/30">
        {/* Header */}
        <div
          className="flex items-center justify-between p-2 border-b border-primary/20 cursor-grab active:cursor-grabbing bg-primary/10 touch-none"
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        >
          <div className="flex items-center gap-2">
            <GripVertical className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-gradient-mystic">Calculadora LP</span>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setIsMinimized(!isMinimized)}>
              {isMinimized ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
            </Button>
            {onClose && (
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onClose}>
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Content */}
        {!isMinimized && (
          <div className="p-3 sm:p-4 space-y-3 w-72 sm:w-80 max-h-[70vh] overflow-y-auto">
            {players.map((player, idx) => (
              <div key={player.key}>
                {idx > 0 && <div className="border-t border-primary/20 my-2" />}
                {renderPlayerSection(player)}
              </div>
            ))}

            {/* Custom Counters */}
            {customCounters.length > 0 && (
              <>
                <div className="border-t border-primary/20 my-2" />
                <div className="text-xs font-semibold text-muted-foreground mb-1">Contadores Públicos</div>
                {customCounters.map((counter) => (
                  <div key={counter.id} className="flex items-center justify-between gap-2 py-1">
                    <span className="text-xs font-medium truncate max-w-[100px]">{counter.name}</span>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="outline" className="h-6 w-6 p-0" onClick={() => onUpdateCustomCounter?.(counter.id, counter.value - 1)}>
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span className="text-sm font-bold min-w-[30px] text-center">{counter.value}</span>
                      <Button size="sm" variant="outline" className="h-6 w-6 p-0" onClick={() => onUpdateCustomCounter?.(counter.id, counter.value + 1)}>
                        <Plus className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => onRemoveCustomCounter?.(counter.id)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Add Custom Counter */}
            <div className="border-t border-primary/20 my-2" />
            {showAddCounter ? (
              <div className="space-y-2">
                <Input
                  placeholder="Nome do contador"
                  value={newCounterName}
                  onChange={(e) => setNewCounterName(e.target.value)}
                  className="h-8 text-xs"
                />
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Valor inicial"
                    value={newCounterValue}
                    onChange={(e) => setNewCounterValue(e.target.value)}
                    className="h-8 text-xs flex-1"
                  />
                  <Button size="sm" onClick={handleAddCounter} className="h-8 text-xs">
                    <Plus className="w-3 h-3 mr-1" /> Criar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowAddCounter(false)} className="h-8 text-xs">
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => setShowAddCounter(true)}>
                <PlusCircle className="w-3 h-3 mr-1" /> Adicionar Contador
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};
