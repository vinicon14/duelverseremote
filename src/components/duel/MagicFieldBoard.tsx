/**
 * DuelVerse - Magic: The Gathering Arena Board
 * 
 * Campo completo de MTG com Battlefield, Lands, Graveyard, Exile, Stack e sistema de fases.
 */
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Flame, Skull, Ban, Layers, Zap } from 'lucide-react';
import { getMagicCardImage, MTG_CARD_BACK } from './mtgCardImage';

export interface MagicCard {
  id: string;
  name: string;
  type_line: string;
  oracle_text?: string;
  mana_cost?: string;
  power?: string;
  toughness?: string;
  image?: string;
  image_url?: string;
  image_uris?: Partial<{ normal: string; small: string; art_crop: string; large: string; png: string }>;
  card_faces?: { image_uris?: Partial<{ normal: string; small: string; large: string; png: string }> }[];
  instanceId: string;
  isTapped?: boolean;
  isFaceDown?: boolean;
  counters?: number;
  attachedTo?: string;
}

export type MagicPhase = 
  | 'untap' | 'upkeep' | 'draw' 
  | 'main1' 
  | 'combat_begin' | 'combat_attackers' | 'combat_blockers' | 'combat_damage' | 'combat_end'
  | 'main2' 
  | 'end' | 'cleanup';

const PHASES: { key: MagicPhase; label: string; short: string }[] = [
  { key: 'untap', label: 'Untap', short: 'UNT' },
  { key: 'upkeep', label: 'Upkeep', short: 'UPK' },
  { key: 'draw', label: 'Draw', short: 'DRW' },
  { key: 'main1', label: 'Main 1', short: 'M1' },
  { key: 'combat_begin', label: 'Begin Combat', short: 'BC' },
  { key: 'combat_attackers', label: 'Attackers', short: 'ATK' },
  { key: 'combat_blockers', label: 'Blockers', short: 'BLK' },
  { key: 'combat_damage', label: 'Damage', short: 'DMG' },
  { key: 'combat_end', label: 'End Combat', short: 'EC' },
  { key: 'main2', label: 'Main 2', short: 'M2' },
  { key: 'end', label: 'End Step', short: 'END' },
  { key: 'cleanup', label: 'Cleanup', short: 'CLN' },
];

export interface MagicFieldState {
  battlefield: MagicCard[];
  lands: MagicCard[];
  hand: MagicCard[];
  library: MagicCard[];
  graveyard: MagicCard[];
  exile: MagicCard[];
  stack: MagicCard[];
  commandZone: MagicCard[];
}

export type MagicZoneType = keyof MagicFieldState;

interface MagicFieldBoardProps {
  fieldState: MagicFieldState;
  currentPhase: MagicPhase;
  onPhaseChange: (phase: MagicPhase) => void;
  onZoneClick: (zone: MagicZoneType) => void;
  onCardClick: (card: MagicCard, zone: MagicZoneType) => void;
  onCardDrop: (zone: MagicZoneType, card: MagicCard) => void;
  onTapCard: (card: MagicCard) => void;
  isFullscreen?: boolean;
}

const CardSlot = ({
  card,
  zone,
  onCardClick,
  onDragStart,
  onTap,
}: {
  card: MagicCard;
  zone: MagicZoneType;
  onCardClick: (card: MagicCard, zone: MagicZoneType) => void;
  onDragStart: (e: React.DragEvent, card: MagicCard, zone: MagicZoneType) => void;
  onTap?: (card: MagicCard) => void;
}) => {
  return (
    <div
      className={cn(
        'relative w-[60px] h-[84px] sm:w-[72px] sm:h-[100px] md:w-[80px] md:h-[112px] rounded-md border border-border/40 cursor-pointer transition-all hover:border-primary/60 hover:shadow-lg hover:scale-105 overflow-hidden flex-shrink-0',
        card.isTapped && 'rotate-90 origin-center mx-3'
      )}
      draggable
      onDragStart={(e) => onDragStart(e, card, zone)}
      onClick={() => onCardClick(card, zone)}
      onDoubleClick={() => onTap?.(card)}
      title={`${card.name}${card.isTapped ? ' (Tapped)' : ''}${card.counters ? ` [${card.counters} counters]` : ''}`}
    >
      <img
        src={getMagicCardImage(card, 'small')}
        alt={card.name}
        className="w-full h-full object-cover"
        loading="lazy"
        onError={(e) => { (e.target as HTMLImageElement).src = MTG_CARD_BACK; }}
      />
      {card.counters && card.counters > 0 && (
        <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[10px] px-1.5 rounded-bl font-bold">
          {card.counters}
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[8px] sm:text-[9px] text-center truncate px-0.5 py-px">
        {card.isFaceDown ? '???' : card.name}
      </div>
    </div>
  );
};

const DropZone = ({
  zone,
  label,
  icon,
  cards,
  onDragOver,
  onDrop,
  onCardClick,
  onDragStart,
  onTap,
  onZoneClick,
  className,
  compact = false,
  hideTopCard = false,
}: {
  zone: MagicZoneType;
  label: string;
  icon?: React.ReactNode;
  cards: MagicCard[];
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, zone: MagicZoneType) => void;
  onCardClick: (card: MagicCard, zone: MagicZoneType) => void;
  onDragStart: (e: React.DragEvent, card: MagicCard, zone: MagicZoneType) => void;
  onTap?: (card: MagicCard) => void;
  onZoneClick: (zone: MagicZoneType) => void;
  className?: string;
  compact?: boolean;
  hideTopCard?: boolean;
}) => {
  if (compact) {
    const previewCard = cards[cards.length - 1];
    const previewImage = hideTopCard ? MTG_CARD_BACK : getMagicCardImage(previewCard, 'small');

    return (
      <div
        className={cn(
          'flex flex-col items-center gap-1 p-1 rounded-lg border border-border/30 bg-card/30 min-w-[60px] sm:min-w-[72px] cursor-pointer hover:bg-card/50 transition-colors',
          className
        )}
        onDragOver={onDragOver}
        onDrop={(e) => onDrop(e, zone)}
        onClick={() => onZoneClick(zone)}
      >
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <Badge variant="secondary" className="text-[10px] px-1.5">
          {cards.length}
        </Badge>
        {cards.length > 0 && (
          <div
            className="w-[40px] h-[56px] sm:w-[48px] sm:h-[67px] rounded overflow-hidden border border-border/20"
            draggable={!hideTopCard}
            onDragStart={(e) => {
              if (hideTopCard || !previewCard) return;
              e.stopPropagation();
              onDragStart(e, previewCard, zone);
            }}
          >
            <img
              src={previewImage}
              alt={hideTopCard ? `${label} fechado` : previewCard?.name || label}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).src = MTG_CARD_BACK; }}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-lg border border-border/30 bg-card/20 p-2',
        className
      )}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, zone)}
    >
      <div className="flex items-center gap-1 mb-1.5">
        {icon}
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
        <Badge variant="secondary" className="text-[10px] px-1.5 ml-auto">
          {cards.length}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-1 min-h-[73px] sm:min-h-[89px]">
        {cards.length === 0 && (
          <div className="w-full flex items-center justify-center text-[10px] text-muted-foreground/50">
            Vazio
          </div>
        )}
        {cards.map((card) => (
          <CardSlot
            key={card.instanceId}
            card={card}
            zone={zone}
            onCardClick={onCardClick}
            onDragStart={onDragStart}
            onTap={onTap}
          />
        ))}
      </div>
    </div>
  );
};

export const MagicFieldBoard = ({
  fieldState,
  currentPhase,
  onPhaseChange,
  onZoneClick,
  onCardClick,
  onCardDrop,
  onTapCard,
}: MagicFieldBoardProps) => {
  const [dragData, setDragData] = useState<{ card: MagicCard; zone: MagicZoneType } | null>(null);

  const handleDragStart = (e: React.DragEvent, card: MagicCard, zone: MagicZoneType) => {
    setDragData({ card, zone });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, zone: MagicZoneType) => {
    e.preventDefault();
    if (dragData) {
      onCardDrop(zone, dragData.card);
      setDragData(null);
    }
  };

  const advancePhase = () => {
    const currentIdx = PHASES.findIndex((p) => p.key === currentPhase);
    const nextIdx = (currentIdx + 1) % PHASES.length;
    onPhaseChange(PHASES[nextIdx].key);
  };

  return (
    <div className="flex flex-col gap-2 h-full">
      <div className="flex items-center gap-0.5 overflow-x-auto pb-1 px-1">
        {PHASES.map((phase) => (
          <Button
            key={phase.key}
            variant={currentPhase === phase.key ? 'default' : 'ghost'}
            size="sm"
            className={cn(
              'text-[9px] sm:text-[10px] px-1.5 py-0.5 h-6 flex-shrink-0',
              currentPhase === phase.key && 'bg-primary text-primary-foreground shadow-sm'
            )}
            onClick={() => onPhaseChange(phase.key)}
            title={phase.label}
          >
            {phase.short}
          </Button>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="text-[10px] px-2 h-6 ml-1 flex-shrink-0"
          onClick={advancePhase}
        >
          <Zap className="w-3 h-3 mr-1" />
          Next
        </Button>
      </div>

      {fieldState.stack.length > 0 && (
        <DropZone
          zone="stack"
          label="Stack"
          icon={<Layers className="w-3 h-3" />}
          cards={fieldState.stack}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onCardClick={onCardClick}
          onDragStart={handleDragStart}
          onZoneClick={onZoneClick}
          className="border-amber-500/40 bg-amber-500/5"
        />
      )}

      <div className="flex-1 flex flex-col gap-2 overflow-auto">
        <DropZone
          zone="battlefield"
          label="Battlefield (Permanentes)"
          icon={<Flame className="w-3 h-3" />}
          cards={fieldState.battlefield}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onCardClick={onCardClick}
          onDragStart={handleDragStart}
          onTap={onTapCard}
          onZoneClick={onZoneClick}
          className="flex-1 min-h-[100px] border-primary/20"
        />

        <DropZone
          zone="lands"
          label="Lands (Terrenos)"
          cards={fieldState.lands}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onCardClick={onCardClick}
          onDragStart={handleDragStart}
          onTap={onTapCard}
          onZoneClick={onZoneClick}
          className="min-h-[80px] border-green-500/20 bg-green-500/5"
        />
      </div>

      <div className="flex gap-2">
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          <DropZone
            zone="library"
            label="Library"
            icon={<Layers className="w-3 h-3" />}
            cards={fieldState.library}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onCardClick={onCardClick}
            onDragStart={handleDragStart}
            onZoneClick={onZoneClick}
            compact
            hideTopCard
          />
          <DropZone
            zone="graveyard"
            label="Graveyard"
            icon={<Skull className="w-3 h-3" />}
            cards={fieldState.graveyard}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onCardClick={onCardClick}
            onDragStart={handleDragStart}
            onZoneClick={onZoneClick}
            compact
            className="border-red-500/20"
          />
          <DropZone
            zone="exile"
            label="Exile"
            icon={<Ban className="w-3 h-3" />}
            cards={fieldState.exile}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onCardClick={onCardClick}
            onDragStart={handleDragStart}
            onZoneClick={onZoneClick}
            compact
            className="border-purple-500/20"
          />
        </div>

        <DropZone
          zone="hand"
          label="Mão"
          cards={fieldState.hand}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onCardClick={onCardClick}
          onDragStart={handleDragStart}
          onZoneClick={onZoneClick}
          className="flex-1 border-blue-500/20 bg-blue-500/5"
        />
      </div>
    </div>
  );
};