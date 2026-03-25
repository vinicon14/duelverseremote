/**
 * DuelVerse - Magic: The Gathering Arena Board
 * 
 * Campo completo de MTG com Battlefield, Lands, Graveyard, Exile, Stack e sistema de fases.
 */
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Flame, Skull, Ban, Layers, Zap, ZoomIn, ZoomOut, ChevronUp, ChevronDown } from 'lucide-react';
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

const CARD_SIZES = [
  { w: 44, h: 62 },  // 0 - tiny
  { w: 52, h: 73 },  // 1 - small
  { w: 60, h: 84 },  // 2 - medium (default)
  { w: 72, h: 100 }, // 3 - large
  { w: 88, h: 123 }, // 4 - xl
];

const CardSlot = ({
  card,
  zone,
  onCardClick,
  onDragStart,
  onTap,
  size,
}: {
  card: MagicCard;
  zone: MagicZoneType;
  onCardClick: (card: MagicCard, zone: MagicZoneType) => void;
  onDragStart: (e: React.DragEvent, card: MagicCard, zone: MagicZoneType) => void;
  onTap?: (card: MagicCard) => void;
  size: { w: number; h: number };
}) => {
  return (
    <div
      className={cn(
        'relative rounded-md border border-border/40 cursor-pointer transition-all hover:border-primary/60 hover:shadow-lg hover:scale-105 overflow-hidden flex-shrink-0',
        card.isTapped && 'rotate-90 origin-center mx-2'
      )}
      style={{ width: size.w, height: size.h }}
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
      {size.w >= 52 && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[7px] sm:text-[8px] text-center truncate px-0.5 py-px">
          {card.isFaceDown ? '???' : card.name}
        </div>
      )}
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
  cardSize,
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
  cardSize: { w: number; h: number };
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
        'rounded-lg border border-border/30 bg-card/20 p-2 sm:p-3 flex flex-col',
        className
      )}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, zone)}
    >
      <div className="flex items-center gap-1.5 mb-1 flex-shrink-0">
        {icon}
        <span className="text-[11px] sm:text-xs font-medium text-muted-foreground">{label}</span>
        <Badge variant="secondary" className="text-[10px] px-1.5 ml-auto">
          {cards.length}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-1 sm:gap-1.5 flex-1 content-start overflow-auto">
        {cards.length === 0 && (
          <div className="w-full flex items-center justify-center text-xs text-muted-foreground/50 italic">
            Arraste cartas aqui
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
            size={cardSize}
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
  const [sizeIdx, setSizeIdx] = useState(1); // default small
  const [handExpanded, setHandExpanded] = useState(false);

  const cardSize = CARD_SIZES[sizeIdx];

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

  const commonDropZoneProps = {
    onDragOver: handleDragOver,
    onDrop: handleDrop,
    onCardClick,
    onDragStart: handleDragStart,
    onZoneClick,
    cardSize,
  };

  return (
    <div className="flex flex-col gap-1.5 h-full">
      {/* Phase bar + zoom controls */}
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
        <Button variant="outline" size="sm" className="text-[10px] px-2 h-6 ml-1 flex-shrink-0" onClick={advancePhase}>
          <Zap className="w-3 h-3 mr-1" /> Next
        </Button>
        <div className="flex items-center gap-0.5 ml-auto flex-shrink-0">
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setSizeIdx((i) => Math.max(0, i - 1))} disabled={sizeIdx === 0}>
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <span className="text-[9px] text-muted-foreground w-4 text-center">{sizeIdx + 1}</span>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setSizeIdx((i) => Math.min(CARD_SIZES.length - 1, i + 1))} disabled={sizeIdx === CARD_SIZES.length - 1}>
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {fieldState.stack.length > 0 && (
        <DropZone
          zone="stack"
          label="Stack"
          icon={<Layers className="w-3 h-3" />}
          cards={fieldState.stack}
          {...commonDropZoneProps}
          className="border-amber-500/40 bg-amber-500/5"
        />
      )}

      {/* Battlefield + Lands - fill remaining space equally */}
      <div className="flex-1 flex flex-col gap-1 min-h-0">
        <DropZone
          zone="battlefield"
          label="Battlefield"
          icon={<Flame className="w-3 h-3" />}
          cards={fieldState.battlefield}
          {...commonDropZoneProps}
          onTap={onTapCard}
          className="flex-1 min-h-0 border-primary/20"
        />
        <DropZone
          zone="lands"
          label="Lands"
          cards={fieldState.lands}
          {...commonDropZoneProps}
          onTap={onTapCard}
          className="flex-1 min-h-0 border-green-500/20 bg-green-500/5"
        />
      </div>

      {/* Bottom: side zones + hand - fixed height */}
      <div className="flex gap-1.5 flex-shrink-0">
        <div className="flex flex-col gap-1 flex-shrink-0">
          <DropZone zone="library" label="Library" icon={<Layers className="w-3 h-3" />} cards={fieldState.library} {...commonDropZoneProps} compact hideTopCard />
          <DropZone zone="graveyard" label="Grave" icon={<Skull className="w-3 h-3" />} cards={fieldState.graveyard} {...commonDropZoneProps} compact className="border-red-500/20" />
          <DropZone zone="exile" label="Exile" icon={<Ban className="w-3 h-3" />} cards={fieldState.exile} {...commonDropZoneProps} compact className="border-purple-500/20" />
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <button
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1 pb-0.5"
            onClick={() => setHandExpanded((e) => !e)}
          >
            {handExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
            Mão ({fieldState.hand.length}) — {handExpanded ? 'minimizar' : 'expandir'}
          </button>
          <div
            className={cn(
              'transition-all overflow-auto rounded-lg border border-blue-500/20 bg-blue-500/5',
              handExpanded ? 'max-h-[35vh]' : 'max-h-[80px]'
            )}
          >
            <DropZone
              zone="hand"
              label="Mão"
              cards={fieldState.hand}
              {...commonDropZoneProps}
              className="border-0 bg-transparent"
            />
          </div>
        </div>
      </div>
    </div>
  );
};