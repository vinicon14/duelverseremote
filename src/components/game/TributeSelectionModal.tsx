import React, { useState } from 'react';
import { GameCard } from '@/components/duel/DuelFieldBoard';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface TributeSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  requiredTributes: number;
  availableMonsters: GameCard[];
  onTributesSelected: (tributes: GameCard[]) => void;
  cardToSummon: GameCard;
}

export const TributeSelectionModal: React.FC<TributeSelectionModalProps> = ({
  isOpen,
  onClose,
  requiredTributes,
  availableMonsters,
  onTributesSelected,
  cardToSummon
}) => {
  const [selectedTributes, setSelectedTributes] = useState<GameCard[]>([]);

  const handleMonsterToggle = (monster: GameCard) => {
    setSelectedTributes(prev => {
      const isSelected = prev.some(t => t.instanceId === monster.instanceId);
      if (isSelected) {
        return prev.filter(t => t.instanceId !== monster.instanceId);
      } else {
        if (prev.length < requiredTributes) {
          return [...prev, monster];
        }
        return prev;
      }
    });
  };

  const handleConfirm = () => {
    if (selectedTributes.length === requiredTributes) {
      onTributesSelected(selectedTributes);
      onClose();
      setSelectedTributes([]);
    }
  };

  const handleCancel = () => {
    onClose();
    setSelectedTributes([]);
  };

  const canConfirm = selectedTributes.length === requiredTributes;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Selecionar Tributos ({requiredTributes} {requiredTributes === 1 ? 'tributo' : 'tributos'} necessários)
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Card being summoned */}
          <div className="p-4 bg-blue-50 rounded-lg">
            <h3 className="font-semibold mb-2">Invocando:</h3>
            <Card className="max-w-xs">
              <CardContent className="p-3">
                <div className="font-medium">{cardToSummon.name}</div>
                <div className="text-sm text-gray-600">{cardToSummon.type}</div>
                {cardToSummon.level && (
                  <Badge variant="outline" className="mt-1">
                    Nível {cardToSummon.level}
                  </Badge>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Available monsters for tribute */}
          <div>
            <h3 className="font-semibold mb-2">
              Monstros disponíveis para tributo ({selectedTributes.length}/{requiredTributes})
            </h3>
            
            {availableMonsters.length === 0 ? (
              <p className="text-gray-500">Nenhum monstro disponível para tributo.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {availableMonsters.map(monster => (
                  <Card
                    key={monster.instanceId}
                    className={`cursor-pointer transition-all ${
                      selectedTributes.some(t => t.instanceId === monster.instanceId)
                        ? 'ring-2 ring-blue-500 bg-blue-50'
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => handleMonsterToggle(monster)}
                  >
                    <CardContent className="p-3">
                      <div className="font-medium text-sm">{monster.name}</div>
                      <div className="text-xs text-gray-600">{monster.type}</div>
                      {monster.level && (
                        <Badge variant="outline" className="mt-1 text-xs">
                          Nível {monster.level}
                        </Badge>
                      )}
                      {monster.atk && monster.def && (
                        <div className="text-xs mt-1">
                          ATK {monster.atk} / DEF {monster.def}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex justify-end space-x-3 pt-4">
            <Button variant="outline" onClick={handleCancel}>
              Cancelar
            </Button>
            <Button 
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Invocar ({selectedTributes.length} tributos)
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};