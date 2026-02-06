import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ArrowLeftRight, Check, X, RefreshCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GameCard } from './DuelFieldBoard';

interface SideDeckSwapModalProps {
  open: boolean;
  onClose: () => void;
  mainDeck: GameCard[];
  sideDeck: GameCard[];
  onSwapComplete: (newMainDeck: GameCard[], newSideDeck: GameCard[]) => void;
}

export const SideDeckSwapModal = ({
  open,
  onClose,
  mainDeck,
  sideDeck,
  onSwapComplete,
}: SideDeckSwapModalProps) => {
  // Track selected cards from each deck
  const [selectedFromMain, setSelectedFromMain] = useState<Set<string>>(new Set());
  const [selectedFromSide, setSelectedFromSide] = useState<Set<string>>(new Set());

  const canSwap = selectedFromMain.size > 0 && selectedFromMain.size === selectedFromSide.size;

  const handleMainCardClick = (card: GameCard) => {
    setSelectedFromMain(prev => {
      const next = new Set(prev);
      if (next.has(card.instanceId)) {
        next.delete(card.instanceId);
      } else {
        next.add(card.instanceId);
      }
      return next;
    });
  };

  const handleSideCardClick = (card: GameCard) => {
    setSelectedFromSide(prev => {
      const next = new Set(prev);
      if (next.has(card.instanceId)) {
        next.delete(card.instanceId);
      } else {
        next.add(card.instanceId);
      }
      return next;
    });
  };

  const handleSwap = () => {
    if (!canSwap) return;

    // Get selected cards from main deck
    const cardsMovingToSide = mainDeck.filter(c => selectedFromMain.has(c.instanceId));
    // Get selected cards from side deck
    const cardsMovingToMain = sideDeck.filter(c => selectedFromSide.has(c.instanceId));

    // Create new decks
    const newMainDeck = [
      ...mainDeck.filter(c => !selectedFromMain.has(c.instanceId)),
      ...cardsMovingToMain,
    ];
    const newSideDeck = [
      ...sideDeck.filter(c => !selectedFromSide.has(c.instanceId)),
      ...cardsMovingToSide,
    ];

    onSwapComplete(newMainDeck, newSideDeck);
    handleReset();
    onClose();
  };

  const handleReset = () => {
    setSelectedFromMain(new Set());
    setSelectedFromSide(new Set());
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  // Group cards by id for display
  const groupedMainDeck = useMemo(() => {
    const map = new Map<number, GameCard[]>();
    mainDeck.forEach(card => {
      if (!map.has(card.id)) {
        map.set(card.id, []);
      }
      map.get(card.id)!.push(card);
    });
    return Array.from(map.entries());
  }, [mainDeck]);

  const groupedSideDeck = useMemo(() => {
    const map = new Map<number, GameCard[]>();
    sideDeck.forEach(card => {
      if (!map.has(card.id)) {
        map.set(card.id, []);
      }
      map.get(card.id)!.push(card);
    });
    return Array.from(map.entries());
  }, [sideDeck]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-primary" />
            Troca de Side Deck
          </DialogTitle>
          <DialogDescription>
            Selecione cartas do Main Deck e do Side Deck para trocar. 
            O número de cartas selecionadas deve ser igual.
          </DialogDescription>
        </DialogHeader>

        {/* Selection Status */}
        <div className="flex items-center justify-center gap-4 py-2 bg-muted/30 rounded-lg">
          <Badge variant={selectedFromMain.size > 0 ? "default" : "outline"} className="gap-1">
            Main: {selectedFromMain.size}
          </Badge>
          <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
          <Badge variant={selectedFromSide.size > 0 ? "default" : "outline"} className="gap-1">
            Side: {selectedFromSide.size}
          </Badge>
          {canSwap && (
            <Badge variant="secondary" className="bg-green-500/20 text-green-600 gap-1">
              <Check className="h-3 w-3" />
              Pronto para trocar
            </Badge>
          )}
          {selectedFromMain.size > 0 && selectedFromSide.size > 0 && !canSwap && (
            <Badge variant="destructive" className="gap-1">
              <X className="h-3 w-3" />
              Selecione quantidades iguais
            </Badge>
          )}
        </div>

        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-hidden">
          {/* Main Deck Section */}
          <div className="flex flex-col border rounded-lg overflow-hidden">
            <div className="p-2 bg-muted/50 border-b flex items-center justify-between">
              <span className="text-sm font-medium">Main Deck</span>
              <Badge variant="outline">{mainDeck.length} cartas</Badge>
            </div>
            <ScrollArea className="flex-1 p-2">
              <div className="grid grid-cols-5 sm:grid-cols-6 gap-1">
                {groupedMainDeck.map(([cardId, cards]) => (
                  cards.map((card) => (
                    <div
                      key={card.instanceId}
                      className={cn(
                        "relative cursor-pointer rounded-sm overflow-hidden border-2 transition-all",
                        selectedFromMain.has(card.instanceId)
                          ? "border-primary ring-2 ring-primary/50 scale-95"
                          : "border-transparent hover:border-muted-foreground/30"
                      )}
                      onClick={() => handleMainCardClick(card)}
                    >
                      <img
                        src={card.card_images?.[0]?.image_url_small}
                        alt={card.name}
                        title={card.name}
                        className="w-full h-auto"
                      />
                      {selectedFromMain.has(card.instanceId) && (
                        <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                          <Check className="h-6 w-6 text-primary" />
                        </div>
                      )}
                    </div>
                  ))
                ))}
                {mainDeck.length === 0 && (
                  <p className="col-span-full text-center text-sm text-muted-foreground py-8">
                    Deck vazio
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Side Deck Section */}
          <div className="flex flex-col border rounded-lg overflow-hidden">
            <div className="p-2 bg-muted/50 border-b flex items-center justify-between">
              <span className="text-sm font-medium">Side Deck</span>
              <Badge variant="outline">{sideDeck.length} cartas</Badge>
            </div>
            <ScrollArea className="flex-1 p-2">
              <div className="grid grid-cols-5 sm:grid-cols-6 gap-1">
                {groupedSideDeck.map(([cardId, cards]) => (
                  cards.map((card) => (
                    <div
                      key={card.instanceId}
                      className={cn(
                        "relative cursor-pointer rounded-sm overflow-hidden border-2 transition-all",
                        selectedFromSide.has(card.instanceId)
                          ? "border-primary ring-2 ring-primary/50 scale-95"
                          : "border-transparent hover:border-muted-foreground/30"
                      )}
                      onClick={() => handleSideCardClick(card)}
                    >
                      <img
                        src={card.card_images?.[0]?.image_url_small}
                        alt={card.name}
                        title={card.name}
                        className="w-full h-auto"
                      />
                      {selectedFromSide.has(card.instanceId) && (
                        <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                          <Check className="h-6 w-6 text-primary" />
                        </div>
                      )}
                    </div>
                  ))
                ))}
                {sideDeck.length === 0 && (
                  <p className="col-span-full text-center text-sm text-muted-foreground py-8">
                    Side Deck vazio
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="flex-row gap-2">
          <Button variant="outline" onClick={handleReset} className="gap-1">
            <RefreshCcw className="h-4 w-4" />
            Limpar Seleção
          </Button>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSwap} 
            disabled={!canSwap}
            className="gap-1"
          >
            <ArrowLeftRight className="h-4 w-4" />
            Trocar ({selectedFromMain.size} cartas)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
