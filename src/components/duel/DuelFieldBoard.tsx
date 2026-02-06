import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
  Layers, 
  Flame, 
  Ban, 
  Sparkles, 
  Eye,
  EyeOff,
  RotateCw,
  Link2
} from 'lucide-react';
import { Shield, Swords } from 'lucide-react';

// Card back image for face-down cards
const CARD_BACK_URL = 'https://images.ygoprodeck.com/images/cards/back_high.jpg';

export interface GameCard {
  id: number;
  name: string;
  type: string;
  desc: string;
  atk?: number;
  def?: number;
  level?: number;
  race: string;
  attribute?: string;
  card_images?: {
    id: number;
    image_url: string;
    image_url_small: string;
    image_url_cropped: string;
  }[];
  instanceId: string;
  isFaceDown?: boolean;
  attachedCards?: GameCard[];
  position?: 'attack' | 'defense';
}

export type FieldZoneType = 
  | 'monster1' | 'monster2' | 'monster3' | 'monster4' | 'monster5'
  | 'spell1' | 'spell2' | 'spell3' | 'spell4' | 'spell5'
  | 'extraMonster1' | 'extraMonster2'
  | 'fieldSpell'
  | 'graveyard'
  | 'banished'
  | 'extraDeck'
  | 'deck'
  | 'sideDeck';

export interface FieldState {
  monster1: GameCard | null;
  monster2: GameCard | null;
  monster3: GameCard | null;
  monster4: GameCard | null;
  monster5: GameCard | null;
  spell1: GameCard | null;
  spell2: GameCard | null;
  spell3: GameCard | null;
  spell4: GameCard | null;
  spell5: GameCard | null;
  extraMonster1: GameCard | null;
  extraMonster2: GameCard | null;
  fieldSpell: GameCard | null;
  graveyard: GameCard[];
  banished: GameCard[];
  extraDeck: GameCard[];
  deck: GameCard[];
  sideDeck: GameCard[];
  hand: GameCard[];
}

interface DuelFieldBoardProps {
  fieldState: FieldState;
  onZoneClick: (zone: FieldZoneType) => void;
  onCardClick: (card: GameCard, zone: FieldZoneType) => void;
  onCardDrop: (zone: FieldZoneType, card: GameCard) => void;
  isFullscreen?: boolean;
}

const ZoneSlot = ({
  zone,
  card,
  label,
  onClick,
  onCardClick,
  onDragOver,
  onDrop,
  className,
  isHorizontal = false,
}: {
  zone: FieldZoneType;
  card: GameCard | null;
  label: string;
  onClick: () => void;
  onCardClick: (card: GameCard) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  className?: string;
  isHorizontal?: boolean;
}) => {
  const hasCard = card !== null;

  const handleDragStart = (e: React.DragEvent) => {
    if (!card) return;
    e.dataTransfer.setData('application/json', JSON.stringify({ ...card, sourceZone: zone }));
    e.dataTransfer.effectAllowed = 'move';
  };
  
  return (
    <div
      className={cn(
        "relative border-2 border-dashed border-muted-foreground/30 rounded-md flex items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all",
        "w-[44px] h-[64px] sm:w-[52px] sm:h-[76px] md:w-[60px] md:h-[88px]",
        hasCard && "border-solid border-primary/20 bg-transparent",
        className
      )}
      onClick={() => hasCard ? onCardClick(card!) : onClick()}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {hasCard ? (
        <div 
          className={cn(
            "relative w-full h-full",
            card.position === 'defense' && isHorizontal && "rotate-90"
          )}
          draggable
          onDragStart={handleDragStart}
        >
          {/* Face-down indicator */}
          {card.isFaceDown && (
            <div className="absolute top-0.5 right-0.5 z-10">
              <EyeOff className="h-3 w-3 text-red-500 drop-shadow-lg" />
            </div>
          )}
          
          {/* Position indicator */}
          {card.position === 'defense' && (
            <div className="absolute bottom-0.5 left-0.5 z-10">
              <RotateCw className="h-3 w-3 text-blue-400 drop-shadow-lg" />
            </div>
          )}
          
          {/* XYZ materials count */}
          {card.attachedCards && card.attachedCards.length > 0 && (
            <div className="absolute -bottom-1 -right-1 z-10">
              <Badge className="text-[8px] h-4 px-1 bg-yellow-600/90">
                <Link2 className="h-2 w-2 mr-0.5" />
                {card.attachedCards.length}
              </Badge>
            </div>
          )}
          
          {/* ATK/DEF Display for monsters */}
          {card.atk !== undefined && !card.isFaceDown && (
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 z-20">
              <div className="bg-background/90 border border-border text-[6px] sm:text-[7px] font-bold px-1 py-0.5 rounded flex items-center gap-0.5 whitespace-nowrap">
                <Swords className="h-2 w-2 text-destructive" />
                <span className="text-destructive">{card.atk}</span>
                <span className="text-muted-foreground">/</span>
                <Shield className="h-2 w-2 text-primary" />
                <span className="text-primary">{card.def ?? '?'}</span>
              </div>
            </div>
          )}
          
          <img
            src={card.isFaceDown ? CARD_BACK_URL : card.card_images?.[0]?.image_url_small}
            alt={card.isFaceDown ? 'Face-down card' : card.name}
            className={cn(
              "w-full h-full object-cover rounded-md shadow-sm hover:shadow-lg transition-all hover:scale-105 cursor-grab active:cursor-grabbing",
              card.position === 'defense' && isHorizontal && "rotate-90"
            )}
            title={card.isFaceDown ? 'Face-down card' : card.name}
          />
        </div>
      ) : (
        <span className="text-[8px] sm:text-[10px] text-muted-foreground/50 text-center px-1">
          {label}
        </span>
      )}
    </div>
  );
};

const PileZone = ({
  zone,
  cards,
  icon: Icon,
  label,
  onClick,
  onDragOver,
  onDrop,
  iconColor,
}: {
  zone: FieldZoneType;
  cards: GameCard[];
  icon: typeof Layers;
  label: string;
  onClick: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  iconColor: string;
}) => {
  return (
    <div
      className={cn(
        "relative border-2 border-dashed border-muted-foreground/30 rounded-md flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all",
        "w-[44px] h-[64px] sm:w-[52px] sm:h-[76px] md:w-[60px] md:h-[88px]",
        cards.length > 0 && "border-solid border-primary/20"
      )}
      onClick={onClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {cards.length > 0 ? (
        <div className="relative w-full h-full">
          {/* Show top card back for deck, or top card for others */}
          {zone === 'deck' ? (
            <img
              src={CARD_BACK_URL}
              alt="Deck"
              className="w-full h-full object-cover rounded-md shadow-sm"
            />
          ) : (
            <img
              src={cards[cards.length - 1]?.card_images?.[0]?.image_url_small || CARD_BACK_URL}
              alt={label}
              className="w-full h-full object-cover rounded-md shadow-sm"
            />
          )}
          <Badge className="absolute -top-1 -right-1 text-[10px] h-5 px-1.5 bg-background/90 border border-border text-foreground">
            {cards.length}
          </Badge>
        </div>
      ) : (
        <>
          <Icon className={cn("h-4 w-4 mb-1", iconColor)} />
          <span className="text-[8px] sm:text-[10px] text-muted-foreground/50 text-center">
            {label}
          </span>
        </>
      )}
    </div>
  );
};

export const DuelFieldBoard = ({
  fieldState,
  onZoneClick,
  onCardClick,
  onCardDrop,
  isFullscreen = false,
}: DuelFieldBoardProps) => {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (zone: FieldZoneType) => (e: React.DragEvent) => {
    e.preventDefault();
    const cardData = e.dataTransfer.getData('application/json');
    if (cardData) {
      try {
        const card = JSON.parse(cardData) as GameCard;
        onCardDrop(zone, card);
      } catch (err) {
        console.error('Failed to parse dropped card:', err);
      }
    }
  };

  return (
    <div 
      className={cn(
        "relative w-full bg-gradient-to-b from-cyan-900/40 via-blue-900/30 to-cyan-900/40 rounded-lg p-2 sm:p-3 border border-border/50",
        isFullscreen && "scale-100 origin-top-left"
      )}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Cpath d='M20 0L40 20 20 40 0 20z' fill='%23ffffff' fill-opacity='0.03'/%3E%3C/svg%3E")`,
      }}
    >
      {/* Field Layout */}
      <div className="flex flex-col gap-2 sm:gap-3">
        
        {/* Extra Monster Zones Row */}
        <div className="flex justify-center gap-1 sm:gap-2">
          <div className="flex items-center gap-8 sm:gap-16">
            <ZoneSlot
              zone="extraMonster1"
              card={fieldState.extraMonster1}
              label="Extra Monster"
              onClick={() => onZoneClick('extraMonster1')}
              onCardClick={(card) => onCardClick(card, 'extraMonster1')}
              onDragOver={handleDragOver}
              onDrop={handleDrop('extraMonster1')}
              className="border-purple-500/30"
              isHorizontal
            />
            <ZoneSlot
              zone="extraMonster2"
              card={fieldState.extraMonster2}
              label="Extra Monster"
              onClick={() => onZoneClick('extraMonster2')}
              onCardClick={(card) => onCardClick(card, 'extraMonster2')}
              onDragOver={handleDragOver}
              onDrop={handleDrop('extraMonster2')}
              className="border-purple-500/30"
              isHorizontal
            />
          </div>
        </div>

        {/* Main Field Row */}
        <div className="flex justify-center items-center gap-1 sm:gap-2">
          {/* Field Spell Zone (Left) */}
          <ZoneSlot
            zone="fieldSpell"
            card={fieldState.fieldSpell}
            label="Field"
            onClick={() => onZoneClick('fieldSpell')}
            onCardClick={(card) => onCardClick(card, 'fieldSpell')}
            onDragOver={handleDragOver}
            onDrop={handleDrop('fieldSpell')}
            className="border-green-500/30"
          />

          {/* Monster Zones */}
          <div className="flex gap-1 sm:gap-1.5">
            {(['monster1', 'monster2', 'monster3', 'monster4', 'monster5'] as const).map((zone, idx) => (
              <ZoneSlot
                key={zone}
                zone={zone}
                card={fieldState[zone]}
                label={`M${idx + 1}`}
                onClick={() => onZoneClick(zone)}
                onCardClick={(card) => onCardClick(card, zone)}
                onDragOver={handleDragOver}
                onDrop={handleDrop(zone)}
                className="border-orange-500/30"
                isHorizontal
              />
            ))}
          </div>

          {/* Graveyard (Right) */}
          <PileZone
            zone="graveyard"
            cards={fieldState.graveyard}
            icon={Flame}
            label="GY"
            onClick={() => onZoneClick('graveyard')}
            onDragOver={handleDragOver}
            onDrop={handleDrop('graveyard')}
            iconColor="text-orange-500"
          />
        </div>

        {/* Spell/Trap Row */}
        <div className="flex justify-center items-center gap-1 sm:gap-2">
          {/* Extra Deck (Left) */}
          <PileZone
            zone="extraDeck"
            cards={fieldState.extraDeck}
            icon={Sparkles}
            label="Extra"
            onClick={() => onZoneClick('extraDeck')}
            onDragOver={handleDragOver}
            onDrop={handleDrop('extraDeck')}
            iconColor="text-yellow-500"
          />

          {/* Spell/Trap Zones */}
          <div className="flex gap-1 sm:gap-1.5">
            {(['spell1', 'spell2', 'spell3', 'spell4', 'spell5'] as const).map((zone, idx) => (
              <ZoneSlot
                key={zone}
                zone={zone}
                card={fieldState[zone]}
                label={`S/T${idx + 1}`}
                onClick={() => onZoneClick(zone)}
                onCardClick={(card) => onCardClick(card, zone)}
                onDragOver={handleDragOver}
                onDrop={handleDrop(zone)}
                className="border-blue-500/30"
              />
            ))}
          </div>

          {/* Deck (Right) */}
          <PileZone
            zone="deck"
            cards={fieldState.deck}
            icon={Layers}
            label="Deck"
            onClick={() => onZoneClick('deck')}
            onDragOver={handleDragOver}
            onDrop={handleDrop('deck')}
            iconColor="text-blue-500"
          />
        </div>

        {/* Bottom Row: Banished and Side */}
        <div className="flex justify-between items-center">
          {/* Side Deck (Left) */}
          <PileZone
            zone="sideDeck"
            cards={fieldState.sideDeck}
            icon={Layers}
            label="Side"
            onClick={() => onZoneClick('sideDeck')}
            onDragOver={handleDragOver}
            onDrop={handleDrop('sideDeck')}
            iconColor="text-cyan-500"
          />
          
          {/* Banished (Right) */}
          <PileZone
            zone="banished"
            cards={fieldState.banished}
            icon={Ban}
            label="Banish"
            onClick={() => onZoneClick('banished')}
            onDragOver={handleDragOver}
            onDrop={handleDrop('banished')}
            iconColor="text-purple-500"
          />
        </div>
      </div>
    </div>
  );
};
