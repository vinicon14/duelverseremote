import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { 
  Layers, 
  Flame, 
  Ban, 
  Sparkles, 
  EyeOff,
  RotateCw,
  Link2
} from 'lucide-react';
import { Shield, Swords } from 'lucide-react';

// Card back image for face-down cards
const CARD_BACK_URL = 'https://images.ygoprodeck.com/images/cards/back_high.jpg';
const PRIVATE_PILE_ZONES: FieldZoneType[] = ['deck', 'extraDeck', 'sideDeck'];

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
  playmatUrl?: string | null;
  sleeveUrl?: string | null;
  /** When 'rush_duel', renders a 3x3 board (3 monster + 3 spell zones) and hides the Extra Monster Zones (Rush Duel has no Extra Deck / EMZ). */
  tcgType?: string | null;
}

// Local state for effect modal will be managed inside component

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
  sleeveUrl,
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
  sleeveUrl?: string | null;
}) => {
  const hasCard = card !== null;

  const isDefensePos = (pos?: string) => {
    if (!pos) return false;
    return pos.toString().toLowerCase().startsWith('def');
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (!card) return;
    e.dataTransfer.setData('application/json', JSON.stringify({ ...card, sourceZone: zone }));
    e.dataTransfer.effectAllowed = 'move';
  };
  
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-visible rounded-sm border border-white/35 bg-black/20 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] cursor-pointer hover:border-primary/80 hover:bg-primary/10 transition-all",
        "w-[44px] h-[64px] sm:w-[52px] sm:h-[76px] md:w-[60px] md:h-[88px]",
        hasCard && "border-primary/45 bg-transparent shadow-[0_0_16px_rgba(255,255,255,0.08)]",
        className
      )}
      onClick={() => hasCard ? onCardClick(card!) : onClick()}
      onDragOver={onDragOver}
      onDrop={onDrop}
      draggable={hasCard}
      onDragStart={hasCard ? handleDragStart : undefined}
    >
      {hasCard ? (
        <div 
          className={cn(
            "relative w-full h-full",
            isDefensePos(card?.position) && isHorizontal && "rotate-90"
          )}
          style={{
            transformOrigin: 'center center'
          }}
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
            src={card.isFaceDown ? (sleeveUrl || CARD_BACK_URL) : card.card_images?.[0]?.image_url_small}
            alt={card.isFaceDown ? 'Face-down card' : card.name}
            className={cn(
              "w-full h-full object-cover rounded-md shadow-sm hover:shadow-lg transition-all hover:scale-105 cursor-grab active:cursor-grabbing"
            )}
            style={{
              transformOrigin: 'center center'
            }}
            title={card.isFaceDown ? 'Face-down card' : card.name}
          />
        </div>
      ) : (
        <span className="absolute inset-x-0 bottom-1 px-1 text-center text-[6px] sm:text-[7px] font-semibold uppercase leading-tight text-white/60">
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
  sleeveUrl,
}: {
  zone: FieldZoneType;
  cards: GameCard[];
  icon: typeof Layers;
  label: string;
  onClick: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  iconColor: string;
  sleeveUrl?: string | null;
}) => {
  const isPrivatePile = PRIVATE_PILE_ZONES.includes(zone);
  const topCardImage = isPrivatePile
    ? sleeveUrl || CARD_BACK_URL
    : cards[cards.length - 1]?.card_images?.[0]?.image_url_small || CARD_BACK_URL;

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center overflow-visible rounded-sm border border-white/35 bg-black/20 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] cursor-pointer hover:border-primary/80 hover:bg-primary/10 transition-all",
        "w-[44px] h-[64px] sm:w-[52px] sm:h-[76px] md:w-[60px] md:h-[88px]",
        cards.length > 0 && "border-primary/45"
      )}
      onClick={onClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {cards.length > 0 ? (
        <div className="relative w-full h-full">
          <img
            src={topCardImage}
            alt={label}
            className="w-full h-full object-cover rounded-sm shadow-sm"
          />
          <Badge className="absolute -top-1 -right-1 text-[10px] h-5 px-1.5 bg-background/90 border border-border text-foreground">
            {cards.length}
          </Badge>
        </div>
      ) : (
        <>
          <Icon className={cn("h-4 w-4 mb-1", iconColor)} />
          <span className="absolute inset-x-0 bottom-1 px-1 text-center text-[6px] sm:text-[7px] font-semibold uppercase leading-tight text-white/60">
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
  playmatUrl,
  sleeveUrl,
  tcgType,
}: DuelFieldBoardProps) => {
  const isRushDuel = tcgType === 'rush_duel';
  // Rush Duel uses a 3x3 board: 3 monster zones + 3 spell/trap zones, no Extra Monster Zones, no Extra Deck.
  const monsterZones = (isRushDuel
    ? (['monster1', 'monster2', 'monster3'] as const)
    : (['monster1', 'monster2', 'monster3', 'monster4', 'monster5'] as const));
  const spellZones = (isRushDuel
    ? (['spell1', 'spell2', 'spell3'] as const)
    : (['spell1', 'spell2', 'spell3', 'spell4', 'spell5'] as const));
  const fieldGridStyle = {
    gridTemplateColumns: `minmax(44px, 60px) repeat(${monsterZones.length}, minmax(44px, 60px)) minmax(44px, 60px)`,
  };
  const extraMonsterZone: FieldZoneType = fieldState.extraMonster1
    ? 'extraMonster1'
    : fieldState.extraMonster2
      ? 'extraMonster2'
      : 'extraMonster1';
  const extraMonsterCard = fieldState[extraMonsterZone] as GameCard | null;
  const extraMonsterColumn = Math.floor((monsterZones.length + 2) / 2) + 1;

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

  // Effect modal state
  const handleCardClickLocal = (card: GameCard, zone: FieldZoneType) => {
    try {
      onCardClick(card, zone);
    } catch (err) {
      // ignore
    }
  };

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-lg border border-border/50 p-2 sm:p-3",
        !playmatUrl && "bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.16),rgba(15,23,42,0.84)_42%,rgba(2,6,23,0.96))]",
        isFullscreen && "scale-100 origin-top-left"
      )}
      style={{
        backgroundImage: playmatUrl
          ? `url("${playmatUrl}")`
          : `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Cpath d='M20 0L40 20 20 40 0 20z' fill='%23ffffff' fill-opacity='0.03'/%3E%3C/svg%3E")`,
        backgroundSize: playmatUrl ? 'cover' : undefined,
        backgroundPosition: playmatUrl ? 'center' : undefined,
        backgroundRepeat: playmatUrl ? 'no-repeat' : undefined,
      }}
    >
      {playmatUrl && (
        <div className="pointer-events-none absolute inset-0 z-0 rounded-lg bg-black/40" />
      )}

      <div className="relative z-10 mx-auto flex w-full max-w-[560px] flex-col gap-1.5 sm:gap-2">
        {!isRushDuel && (
          <div className="grid gap-1 sm:gap-1.5" style={fieldGridStyle}>
            <div style={{ gridColumn: `${extraMonsterColumn} / span 1` }}>
              <ZoneSlot
                zone={extraMonsterZone}
                card={extraMonsterCard}
                label="Extra Monster Zone"
                onClick={() => onZoneClick(extraMonsterZone)}
                onCardClick={(card) => handleCardClickLocal(card, extraMonsterZone)}
                onDragOver={handleDragOver}
                onDrop={handleDrop(extraMonsterZone)}
                className="border-violet-300/60 bg-violet-950/20"
                isHorizontal
                sleeveUrl={sleeveUrl}
              />
            </div>
          </div>
        )}

        <div className="grid items-center gap-1 sm:gap-1.5" style={fieldGridStyle}>
          <ZoneSlot
            zone="fieldSpell"
            card={fieldState.fieldSpell}
            label="Field Zone"
            onClick={() => onZoneClick('fieldSpell')}
            onCardClick={(card) => handleCardClickLocal(card, 'fieldSpell')}
            onDragOver={handleDragOver}
            onDrop={handleDrop('fieldSpell')}
            className="border-emerald-300/60 bg-emerald-950/20"
            sleeveUrl={sleeveUrl}
          />

          {monsterZones.map((zone) => (
            <ZoneSlot
              key={zone}
              zone={zone}
              card={fieldState[zone]}
              label="Main Monster Zone"
              onClick={() => onZoneClick(zone)}
              onCardClick={(card) => handleCardClickLocal(card, zone)}
              onDragOver={handleDragOver}
              onDrop={handleDrop(zone)}
              className="border-orange-300/60 bg-orange-950/20"
              isHorizontal
              sleeveUrl={sleeveUrl}
            />
          ))}

          <PileZone
            zone="graveyard"
            cards={fieldState.graveyard}
            icon={Flame}
            label="Graveyard"
            onClick={() => onZoneClick('graveyard')}
            onDragOver={handleDragOver}
            onDrop={handleDrop('graveyard')}
            iconColor="text-orange-500"
          />
        </div>

        <div className="grid items-center gap-1 sm:gap-1.5" style={fieldGridStyle}>
          {!isRushDuel ? (
            <PileZone
              zone="extraDeck"
              cards={fieldState.extraDeck}
              icon={Sparkles}
              label="Extra Deck"
              onClick={() => onZoneClick('extraDeck')}
              onDragOver={handleDragOver}
              onDrop={handleDrop('extraDeck')}
              iconColor="text-yellow-500"
              sleeveUrl={sleeveUrl}
            />
          ) : (
            <div className="w-[44px] shrink-0 sm:w-[52px] md:w-[60px]" aria-hidden />
          )}

          {spellZones.map((zone) => (
            <ZoneSlot
              key={zone}
              zone={zone}
              card={fieldState[zone]}
              label="Spell & Trap Zone"
              onClick={() => onZoneClick(zone)}
              onCardClick={(card) => handleCardClickLocal(card, zone)}
              onDragOver={handleDragOver}
              onDrop={handleDrop(zone)}
              className="border-sky-300/60 bg-sky-950/20"
              sleeveUrl={sleeveUrl}
            />
          ))}

          <PileZone
            zone="deck"
            cards={fieldState.deck}
            icon={Layers}
            label="Deck"
            onClick={() => onZoneClick('deck')}
            onDragOver={handleDragOver}
            onDrop={handleDrop('deck')}
            iconColor="text-blue-500"
            sleeveUrl={sleeveUrl}
          />
        </div>

        <div className="grid items-center gap-1 sm:gap-1.5" style={fieldGridStyle}>
          <PileZone
            zone="sideDeck"
            cards={fieldState.sideDeck}
            icon={Layers}
            label="Side Deck"
            onClick={() => onZoneClick('sideDeck')}
            onDragOver={handleDragOver}
            onDrop={handleDrop('sideDeck')}
            iconColor="text-cyan-500"
            sleeveUrl={sleeveUrl}
          />

          <div style={{ gridColumn: `${monsterZones.length + 2} / span 1` }}>
            <PileZone
              zone="banished"
              cards={fieldState.banished}
              icon={Ban}
              label="Banished"
              onClick={() => onZoneClick('banished')}
              onDragOver={handleDragOver}
              onDrop={handleDrop('banished')}
              iconColor="text-purple-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
