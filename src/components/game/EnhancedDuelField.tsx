import React from 'react';
import { DuelFieldBoard } from '../components/duel/DuelFieldBoard';
import { ZonePlacementModal } from '../components/duel/ZonePlacementModal';
import { TributeSelectionModal } from '../components/game/TributeSelectionModal';
import { SpecialSummonModal } from '../components/game/SpecialSummonModal';
import { PhaseControl } from '../components/game/PhaseControl';
import { useFieldManager } from '../hooks/useFieldManager';
import { useGameState } from '../store/gameState';
import { GameCard, FieldZoneType } from '../types/game';

export const EnhancedDuelField: React.FC = () => {
  const gameState = useGameState();
  
  // Initialize field state
  const initialFieldState: Record<FieldZoneType, GameCard | GameCard[]> = {
    monster1: null,
    monster2: null,
    monster3: null,
    monster4: null,
    monster5: null,
    extraMonster1: null,
    extraMonster2: null,
    spell1: null,
    spell2: null,
    spell3: null,
    spell4: null,
    spell5: null,
    fieldSpell: null,
    deck: [],
    extraDeck: [],
    graveyard: [],
    banished: [],
    sideDeck: [],
    hand: [],
  };

  const {
    fieldState,
    placeCard,
    moveCard,
    tributeMonster,
    getAvailableMonsterZones,
    getAvailableSpellTrapZones,
    getMonstersOnField,
    getRequiredTributesForCard,
  } = useFieldManager(initialFieldState);

  const [selectedCard, setSelectedCard] = React.useState<GameCard | null>(null);
  const [placementModalOpen, setPlacementModalOpen] = React.useState(false);
  const [tributeModalOpen, setTributeModalOpen] = React.useState(false);
  const [specialSummonModalOpen, setSpecialSummonModalOpen] = React.useState(false);
  const [fromZone, setFromZone] = React.useState<FieldZoneType>('hand');

  // Mock cards for testing
  const mockHand: GameCard[] = [
    {
      id: 1,
      name: "Blue-Eyes White Dragon",
      type: "Normal Monster",
      desc: "A legendary dragon.",
      atk: 3000,
      def: 2500,
      level: 8,
      race: "Dragon",
      attribute: "LIGHT",
      instanceId: "card-1",
      card_images: [{
        id: 1,
        image_url: "https://images.ygoprodeck.com/images/cards/1000.jpg",
        image_url_small: "https://images.ygoprodeck.com/images/cards_small/1000.jpg",
        image_url_cropped: "https://images.ygoprodeck.com/images/cards_cropped/1000.jpg"
      }]
    },
    {
      id: 2,
      name: "Dark Magician",
      type: "Normal Monster",
      desc: "The ultimate wizard.",
      atk: 2500,
      def: 2100,
      level: 7,
      race: "Spellcaster",
      attribute: "DARK",
      instanceId: "card-2",
      card_images: [{
        id: 2,
        image_url: "https://images.ygoprodeck.com/images/cards/1001.jpg",
        image_url_small: "https://images.ygoprodeck.com/images/cards_small/1001.jpg",
        image_url_cropped: "https://images.ygoprodeck.com/images/cards_cropped/1001.jpg"
      }]
    },
    {
      id: 3,
      name: "Spellbinding Trap",
      type: "Normal Trap",
      desc: "Negate a monster effect.",
      instanceId: "card-3",
      race: "Normal",
      card_images: [{
        id: 3,
        image_url: "https://images.ygoprodeck.com/images/cards/1002.jpg",
        image_url_small: "https://images.ygoprodeck.com/images/cards_small/1002.jpg",
        image_url_cropped: "https://images.ygoprodeck.com/images/cards_cropped/1002.jpg"
      }]
    }
  ];

  // Update field state with mock hand
  React.useEffect(() => {
    setFieldState(prev => ({
      ...prev,
      hand: mockHand,
    }));
  }, []);

  const handleCardClick = (card: GameCard, zone: FieldZoneType) => {
    setSelectedCard(card);
    setFromZone(zone);
    setPlacementModalOpen(true);
  };

  const handleZoneClick = (zone: FieldZoneType) => {
    // If clicking an empty zone with a card selected, place it
    if (selectedCard && !fieldState[zone]) {
      setPlacementModalOpen(true);
    }
  };

  const handlePlaceCard = (zone: FieldZoneType, faceDown: boolean, position: 'attack' | 'defense') => {
    if (!selectedCard) return;

    const requiredTributes = getRequiredTributesForCard(selectedCard);
    
    if (requiredTributes > 0 && fromZone === 'hand' && !faceDown) {
      // Show tribute selection modal
      setTributeModalOpen(true);
    } else {
      // Place the card directly
      try {
        placeCard(selectedCard, zone, faceDown, position, fromZone);
        setSelectedCard(null);
        setPlacementModalOpen(false);
      } catch (error) {
        console.error('Error placing card:', error);
        // Show error message to user
      }
    }
  };

  const handleTributesSelected = (tributes: GameCard[]) => {
    // Tribute the selected monsters
    tributes.forEach(tribute => tributeMonster(tribute));
    
    // Then place the card (this would be handled in the placeCard function)
    setTributeModalOpen(false);
    // Continue with card placement...
  };

  const handleSpecialSummon = (card: GameCard, targetZone: FieldZoneType, materials?: GameCard[]) => {
    try {
      placeCard(card, targetZone, false, 'attack', fromZone);
      setSpecialSummonModalOpen(false);
      setSelectedCard(null);
    } catch (error) {
      console.error('Error special summoning:', error);
    }
  };

  const getOccupiedZones = (): FieldZoneType[] => {
    const occupied: FieldZoneType[] = [];
    
    Object.entries(fieldState).forEach(([zone, content]) => {
      if (content && (Array.isArray(content) ? content.length > 0 : true)) {
        occupied.push(zone as FieldZoneType);
      }
    });
    
    return occupied;
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header with Phase Control */}
        <div className="flex justify-between items-start">
          <h1 className="text-2xl font-bold">Enhanced Duel Field</h1>
          <PhaseControl />
        </div>

        {/* Main Game Board */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Game Field */}
          <div className="lg:col-span-3">
            <DuelFieldBoard
              fieldState={fieldState}
              onCardClick={handleCardClick}
              onZoneClick={handleZoneClick}
              onCardDrop={(card, zone) => {
                setSelectedCard(card);
                setFromZone('hand');
                setPlacementModalOpen(true);
              }}
            />
          </div>

          {/* Side Panel */}
          <div className="space-y-4">
            {/* Game State Info */}
            <div className="bg-white p-4 rounded-lg shadow">
              <h3 className="font-semibold mb-2">Game State</h3>
              <div className="space-y-1 text-sm">
                <div>Phase: {gameState.currentPhase}</div>
                <div>Turn: {gameState.turnPlayer}</div>
                <div>Count: {gameState.turnCount}</div>
              </div>
            </div>

            {/* Available Zones */}
            <div className="bg-white p-4 rounded-lg shadow">
              <h3 className="font-semibold mb-2">Available Zones</h3>
              <div className="space-y-1 text-sm">
                <div>Monster: {getAvailableMonsterZones().length}/5</div>
                <div>Spell/Trap: {getAvailableSpellTrapZones().length}/5</div>
                <div>Field Spell: {!fieldState.fieldSpell ? 'Available' : 'Occupied'}</div>
              </div>
            </div>

            {/* Monsters on Field */}
            <div className="bg-white p-4 rounded-lg shadow">
              <h3 className="font-semibold mb-2">Monsters on Field</h3>
              <div className="space-y-1">
                {getMonstersOnField().length === 0 ? (
                  <div className="text-sm text-gray-500">No monsters</div>
                ) : (
                  getMonstersOnField().map(monster => (
                    <div key={monster.instanceId} className="text-sm">
                      {monster.name} ({monster.position})
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Modals */}
        <ZonePlacementModal
          open={placementModalOpen}
          onClose={() => setPlacementModalOpen(false)}
          card={selectedCard}
          onPlaceCard={handlePlaceCard}
          occupiedZones={getOccupiedZones()}
          fromZone={fromZone}
          currentPlayer={gameState.turnPlayer}
          fieldState={fieldState}
        />

        <TributeSelectionModal
          isOpen={tributeModalOpen}
          onClose={() => setTributeModalOpen(false)}
          requiredTributes={selectedCard ? getRequiredTributesForCard(selectedCard) : 0}
          availableMonsters={getMonstersOnField()}
          onTributesSelected={handleTributesSelected}
          cardToSummon={selectedCard!}
        />

        <SpecialSummonModal
          isOpen={specialSummonModalOpen}
          onClose={() => setSpecialSummonModalOpen(false)}
          card={selectedCard!}
          fromZone={fromZone}
          availableZones={getAvailableMonsterZones()}
          onSpecialSummon={handleSpecialSummon}
          fieldState={fieldState}
        />
      </div>
    </div>
  );
};