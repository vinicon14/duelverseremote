import React, { useState } from 'react';
import { GameCard } from '../types/game';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { isExtraDeckCardType, isRitualMonster } from '../utils/cardValidation';

interface SpecialSummonModalProps {
  isOpen: boolean;
  onClose: () => void;
  card: GameCard;
  fromZone: string;
  availableZones: string[];
  onSpecialSummon: (card: GameCard, targetZone: string, materials?: GameCard[]) => void;
  fieldState: Record<string, unknown>;
}

export const SpecialSummonModal: React.FC<SpecialSummonModalProps> = ({
  isOpen,
  onClose,
  card,
  fromZone,
  availableZones,
  onSpecialSummon,
  fieldState
}) => {
  const [selectedZone, setSelectedZone] = useState<string>('');
  const [selectedMaterials, setSelectedMaterials] = useState<GameCard[]>([]);

  const getSummonType = () => {
    if (isExtraDeckCardType(card.type)) {
      if (card.type.toLowerCase().includes('fusion')) return 'Fusion';
      if (card.type.toLowerCase().includes('synchro')) return 'Synchro';
      if (card.type.toLowerCase().includes('xyz')) return 'XYZ';
      if (card.type.toLowerCase().includes('link')) return 'Link';
    }
    if (isRitualMonster(card.type)) return 'Ritual';
    return 'Special';
  };

  const getAvailableMaterials = () => {
    const materials: GameCard[] = [];
    
    // Get monsters from field
    for (let i = 1; i <= 5; i++) {
      const monster = fieldState[`monster${i}`];
      if (monster) materials.push(monster);
    }
    
    // Get monsters from hand (simplified - would need actual hand state)
    // This would come from the game state
    
    // Get monsters from graveyard
    const graveyard = fieldState.graveyard as GameCard[] | undefined;
    graveyard?.forEach((card: GameCard) => {
      if (card.type.toLowerCase().includes('monster')) {
        materials.push(card);
      }
    });
    
    return materials;
  };

  const handleMaterialToggle = (material: GameCard) => {
    setSelectedMaterials(prev => {
      const isSelected = prev.some(m => m.instanceId === material.instanceId);
      if (isSelected) {
        return prev.filter(m => m.instanceId !== material.instanceId);
      } else {
        return [...prev, material];
      }
    });
  };

  const handleSummon = () => {
    if (selectedZone) {
      onSpecialSummon(card, selectedZone, selectedMaterials);
      onClose();
      setSelectedZone('');
      setSelectedMaterials([]);
    }
  };

  const summonType = getSummonType();
  const availableMaterials = getAvailableMaterials();
  const canSummon = selectedZone && (summonType === 'Special' || selectedMaterials.length > 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Invocação Especial - {summonType}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Card being summoned */}
          <Card className="bg-gradient-to-r from-purple-50 to-blue-50">
            <CardContent className="p-4">
              <div className="flex items-center space-x-4">
                <div className="flex-1">
                  <h3 className="font-bold text-lg">{card.name}</h3>
                  <p className="text-sm text-gray-600">{card.type}</p>
                  {card.level && (
                    <Badge variant="outline" className="mt-1">
                      {card.type.toLowerCase().includes('xyz') ? 'Rank' : 'Level'} {card.level}
                    </Badge>
                  )}
                </div>
                {card.atk && card.def && (
                  <div className="text-right">
                    <div className="font-semibold">ATK {card.atk}</div>
                    <div className="font-semibold">DEF {card.def}</div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="zone" className="w-full">
            <TabsList>
              <TabsTrigger value="zone">Zona de Destino</TabsTrigger>
              {summonType !== 'Special' && (
                <TabsTrigger value="materials">Materiais</TabsTrigger>
              )}
            </TabsList>
            
            <TabsContent value="zone" className="space-y-3">
              <h3 className="font-semibold">Selecione a zona de invocação:</h3>
              <div className="grid grid-cols-3 gap-2">
                {availableZones.map(zone => (
                  <Button
                    key={zone}
                    variant={selectedZone === zone ? "default" : "outline"}
                    onClick={() => setSelectedZone(zone)}
                    className="h-12"
                  >
                    {zone.replace(/([A-Z])/g, ' $1').trim()}
                  </Button>
                ))}
              </div>
            </TabsContent>
            
            {summonType !== 'Special' && (
              <TabsContent value="materials" className="space-y-3">
                <h3 className="font-semibold">Selecione os materiais:</h3>
                {availableMaterials.length === 0 ? (
                  <p className="text-gray-500">Nenhum material disponível.</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {availableMaterials.map(material => (
                      <Card
                        key={material.instanceId}
                        className={`cursor-pointer transition-all ${
                          selectedMaterials.some(m => m.instanceId === material.instanceId)
                            ? 'ring-2 ring-purple-500 bg-purple-50'
                            : 'hover:bg-gray-50'
                        }`}
                        onClick={() => handleMaterialToggle(material)}
                      >
                        <CardContent className="p-3">
                          <div className="font-medium text-sm">{material.name}</div>
                          <div className="text-xs text-gray-600">{material.type}</div>
                          {material.level && (
                            <Badge variant="outline" className="mt-1 text-xs">
                              {material.type.toLowerCase().includes('xyz') ? 'Rank' : 'Level'} {material.level}
                            </Badge>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            )}
          </Tabs>

          {/* Action buttons */}
          <div className="flex justify-end space-x-3 pt-4">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSummon}
              disabled={!canSummon}
              className="bg-purple-600 hover:bg-purple-700"
            >
              Invocar {summonType}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};