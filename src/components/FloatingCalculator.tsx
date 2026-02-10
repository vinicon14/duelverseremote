import { useState, useRef, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Heart, Shield, Minus, Plus, GripVertical, X, Maximize2, Minimize2 } from "lucide-react";

interface FloatingCalculatorProps {
  player1Name: string;
  player2Name: string;
  player1LP: number;
  player2LP: number;
  onUpdateLP: (player: 'player1' | 'player2', amount: number) => void;
  onSetLP: (player: 'player1' | 'player2', value: number) => void;
  currentUserPlayer?: 'player1' | 'player2' | null;
  onClose?: () => void;
}

export const FloatingCalculator = ({
  player1Name,
  player2Name,
  player1LP,
  player2LP,
  onUpdateLP,
  onSetLP,
  currentUserPlayer = null,
  onClose,
}: FloatingCalculatorProps) => {
  // Posição inicial adaptada ao tamanho da tela
  const [position, setPosition] = useState(() => {
    const isMobile = window.innerWidth < 768;
    return { 
      x: isMobile ? 10 : 20, 
      y: isMobile ? 80 : 100 
    };
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const calculatorRef = useRef<HTMLDivElement>(null);

  const [editingPlayer1, setEditingPlayer1] = useState(false);
  const [editingPlayer2, setEditingPlayer2] = useState(false);
  const [tempLP1, setTempLP1] = useState(player1LP.toString());
  const [tempLP2, setTempLP2] = useState(player2LP.toString());

  useEffect(() => {
    setTempLP1(player1LP.toString());
  }, [player1LP]);

  useEffect(() => {
    setTempLP2(player2LP.toString());
  }, [player2LP]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input')) return;
    
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest('button, input')) return;
    
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({
      x: touch.clientX - position.x,
      y: touch.clientY - position.y,
    });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (isDragging) {
      const touch = e.touches[0];
      setPosition({
        x: touch.clientX - dragStart.x,
        y: touch.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove);
      document.addEventListener('touchend', handleTouchEnd);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [isDragging, dragStart]);

  const handleLP1Submit = () => {
    const value = parseInt(tempLP1);
    if (!isNaN(value) && value >= 0) {
      onSetLP('player1', value);
    } else {
      setTempLP1(player1LP.toString());
    }
    setEditingPlayer1(false);
  };

  const handleLP2Submit = () => {
    const value = parseInt(tempLP2);
    if (!isNaN(value) && value >= 0) {
      onSetLP('player2', value);
    } else {
      setTempLP2(player2LP.toString());
    }
    setEditingPlayer2(false);
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
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={() => setIsMinimized(!isMinimized)}
            >
              {isMinimized ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
            </Button>
            {onClose && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                onClick={onClose}
              >
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Content */}
        {!isMinimized && (
          <div className="p-3 sm:p-4 space-y-3 sm:space-y-4 w-72 sm:w-80">
            {/* Player 1 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 sm:gap-2">
                  <Shield className="w-3 h-3 sm:w-4 sm:h-4 text-primary" />
                  <span className="text-xs sm:text-sm font-semibold truncate max-w-[80px] sm:max-w-none">{player1Name}</span>
                </div>
                <div className="flex items-center gap-1 sm:gap-2">
                  <Heart className="w-3 h-3 sm:w-4 sm:h-4 text-destructive" />
                  {editingPlayer1 && currentUserPlayer === 'player1' ? (
                    <Input
                      type="number"
                      value={tempLP1}
                      onChange={(e) => setTempLP1(e.target.value)}
                      onBlur={handleLP1Submit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleLP1Submit();
                        if (e.key === 'Escape') {
                          setTempLP1(player1LP.toString());
                          setEditingPlayer1(false);
                        }
                      }}
                      className="w-24 h-8 text-right text-lg font-bold"
                      autoFocus
                    />
                   ) : (
                      <span
                        className={`text-lg sm:text-xl font-bold text-gradient-mystic ${currentUserPlayer === 'player1' ? 'cursor-pointer hover:opacity-80' : ''}`}
                        onClick={() => currentUserPlayer === 'player1' && setEditingPlayer1(true)}
                      >
                        {player1LP}
                      </span>
                   )}
                </div>
              </div>
              
              {currentUserPlayer === 'player1' && (
                <>
                  <div className="grid grid-cols-4 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onUpdateLP('player1', -1000)}
                      className="text-xs"
                    >
                      <Minus className="w-3 h-3 mr-1" />
                      1k
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onUpdateLP('player1', -500)}
                      className="text-xs"
                    >
                      <Minus className="w-3 h-3 mr-1" />
                      500
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onUpdateLP('player1', 500)}
                      className="text-xs"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      500
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onUpdateLP('player1', 1000)}
                      className="text-xs"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      1k
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onUpdateLP('player1', -100)}
                      className="text-xs"
                    >
                      <Minus className="w-3 h-3 mr-1" />
                      100
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onUpdateLP('player1', 100)}
                      className="text-xs"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      100
                    </Button>
                  </div>
                </>
              )}
            </div>

            <div className="border-t border-primary/20" />

            {/* Player 2 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 sm:gap-2">
                  <Shield className="w-3 h-3 sm:w-4 sm:h-4 text-accent" />
                  <span className="text-xs sm:text-sm font-semibold truncate max-w-[80px] sm:max-w-none">{player2Name}</span>
                </div>
                <div className="flex items-center gap-1 sm:gap-2">
                  <Heart className="w-3 h-3 sm:w-4 sm:h-4 text-destructive" />
                  {editingPlayer2 && currentUserPlayer === 'player2' ? (
                    <Input
                      type="number"
                      value={tempLP2}
                      onChange={(e) => setTempLP2(e.target.value)}
                      onBlur={handleLP2Submit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleLP2Submit();
                        if (e.key === 'Escape') {
                          setTempLP2(player2LP.toString());
                          setEditingPlayer2(false);
                        }
                      }}
                      className="w-24 h-8 text-right text-lg font-bold"
                      autoFocus
                    />
                   ) : (
                      <span
                        className={`text-lg sm:text-xl font-bold text-gradient-mystic ${currentUserPlayer === 'player2' ? 'cursor-pointer hover:opacity-80' : ''}`}
                        onClick={() => currentUserPlayer === 'player2' && setEditingPlayer2(true)}
                      >
                        {player2LP}
                      </span>
                   )}
                </div>
              </div>
              
              {currentUserPlayer === 'player2' && (
                <>
                  <div className="grid grid-cols-4 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onUpdateLP('player2', -1000)}
                      className="text-xs"
                    >
                      <Minus className="w-3 h-3 mr-1" />
                      1k
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onUpdateLP('player2', -500)}
                      className="text-xs"
                    >
                      <Minus className="w-3 h-3 mr-1" />
                      500
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onUpdateLP('player2', 500)}
                      className="text-xs"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      500
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onUpdateLP('player2', 1000)}
                      className="text-xs"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      1k
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onUpdateLP('player2', -100)}
                      className="text-xs"
                    >
                      <Minus className="w-3 h-3 mr-1" />
                      100
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onUpdateLP('player2', 100)}
                      className="text-xs"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      100
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
