/**
 * DuelVerse - Magic: The Gathering Arena Board
 *
 * Campo completo de MTG com Battlefield, Lands, Graveyard, Exile, Stack e sistema de fases.
 */
import { useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Flame, Skull, Ban, Layers, Zap, ZoomIn, ZoomOut, ChevronUp, ChevronDown, Droplets, Swords, Shield } from 'lucide-react';
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

type CardSize = { w: number; h: number };

const HAND_CARD_SIZES: CardSize[] = [
  { w: 36, h: 50 },
  { w: 44, h: 62 },
  { w: 52, h: 73 },
  { w: 60, h: 84 },
];

const FIELD_CARD_SIZES: CardSize[] = [
  { w: 32, h: 45 },
  { w: 40, h: 56 },
  { w: 44, h: 62 },
];

interface MagicFieldBoardProps {
  fieldState: MagicFieldState;
  currentPhase: MagicPhase;
  onPhaseChange: (phase: MagicPhase) => void;
  onZoneClick: (zone: MagicZoneType) => void;
  onCardClick: (card: MagicCard, zone: MagicZoneType) => void;
  onCardDrop: (zone: MagicZoneType, card: MagicCard) => void;
  onTapCard: (card: MagicCard) => void;
  isFullscreen?: boolean;
  playmatUrl?: string | null;
  sleeveUrl?: string | null;
}

const getFaceDownImage = (sleeveUrl?: string | null) => sleeveUrl || MTG_CARD_BACK;

const getPlaymatStyle = (playmatUrl?: string | null): CSSProperties => ({
  backgroundImage: playmatUrl
    ? `url("${playmatUrl}")`
    : `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'%3E%3Cpath d='M24 0L48 24 24 48 0 24z' fill='%23ffffff' fill-opacity='0.03'/%3E%3C/svg%3E")`,
  backgroundSize: playmatUrl ? 'cover' : '48px 48px',
  backgroundPosition: 'center',
  backgroundRepeat: playmatUrl ? 'no-repeat' : 'repeat',
});

const CardSlot = ({
  card,
  zone,
  onCardClick,
  onDragStart,
  onTap,
  size,
  sleeveUrl,
  showName = true,
}: {
  card: MagicCard;
  zone: MagicZoneType;
  onCardClick: (card: MagicCard, zone: MagicZoneType) => void;
  onDragStart: (e: DragEvent, card: MagicCard, zone: MagicZoneType) => void;
  onTap?: (card: MagicCard) => void;
  size: CardSize;
  sleeveUrl?: string | null;
  showName?: boolean;
}) => {
  const imageSrc = card.isFaceDown
    ? getFaceDownImage(sleeveUrl)
    : getMagicCardImage(card, size.w >= 52 ? 'normal' : 'small');

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md border border-border/50 bg-card/70 shadow-sm transition-all hover:border-primary/60 hover:shadow-md',
        'cursor-pointer flex-shrink-0',
        card.isTapped && 'rotate-90 origin-center mx-2'
      )}
      style={{ width: size.w, height: size.h }}
      draggable
      onDragStart={(e) => onDragStart(e, card, zone)}
      onClick={() => onCardClick(card, zone)}
      onDoubleClick={() => onTap?.(card)}
      title={`${card.name}${zone === 'lands' ? ' — duplo clique para gerar mana' : ''}${card.isTapped ? ' (virada)' : ''}`}
    >
      <img
        src={imageSrc}
        alt={card.isFaceDown ? 'Carta virada para baixo' : card.name}
        className="h-full w-full object-cover"
        loading="lazy"
        onError={(e) => { (e.target as HTMLImageElement).src = MTG_CARD_BACK; }}
      />

      {card.counters && card.counters > 0 && (
        <Badge className="absolute right-1 top-1 h-5 min-w-5 justify-center px-1 text-[10px]">
          {card.counters}
        </Badge>
      )}

      {/* Power/Toughness display for creatures */}
      {card.power !== undefined && card.toughness !== undefined && !card.isFaceDown && (
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 z-20">
          <div className="bg-background/90 border border-border text-[6px] sm:text-[7px] font-bold px-1 py-0.5 rounded flex items-center gap-0.5 whitespace-nowrap">
            <Swords className="h-2 w-2 text-destructive" />
            <span className="text-destructive">{card.power}</span>
            <span className="text-muted-foreground">/</span>
            <Shield className="h-2 w-2 text-primary" />
            <span className="text-primary">{card.toughness}</span>
          </div>
        </div>
      )}

      {zone === 'lands' && card.isTapped && (
        <Badge variant="secondary" className="absolute bottom-1 left-1 h-5 px-1.5 text-[9px]">
          <Droplets className="mr-1 h-3 w-3" /> Mana
        </Badge>
      )}

      {showName && size.h >= 56 && (
        <div className="absolute inset-x-0 bottom-0 bg-background/80 px-1 py-0.5 text-center text-[8px] text-foreground backdrop-blur-sm">
          <span className="block truncate">{card.isFaceDown ? 'Face down' : card.name}</span>
        </div>
      )}
    </div>
  );
};

const CompactZone = ({
  zone,
  label,
  icon,
  cards,
  onDragOver,
  onDrop,
  onCardClick,
  onDragStart,
  onZoneClick,
  hideTopCard = false,
  sleeveUrl,
}: {
  zone: MagicZoneType;
  label: string;
  icon?: ReactNode;
  cards: MagicCard[];
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent, zone: MagicZoneType) => void;
  onCardClick: (card: MagicCard, zone: MagicZoneType) => void;
  onDragStart: (e: DragEvent, card: MagicCard, zone: MagicZoneType) => void;
  onZoneClick: (zone: MagicZoneType) => void;
  hideTopCard?: boolean;
  sleeveUrl?: string | null;
}) => {
  const previewCard = cards[cards.length - 1];
  const previewSrc = hideTopCard
    ? getFaceDownImage(sleeveUrl)
    : previewCard?.isFaceDown
      ? getFaceDownImage(sleeveUrl)
      : getMagicCardImage(previewCard, 'small');

  return (
    <div
      className="flex min-w-[54px] flex-col items-center gap-1 rounded-lg border border-border/40 bg-card/50 p-1.5 transition-colors hover:border-primary/40"
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, zone)}
      onClick={() => onZoneClick(zone)}
    >
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <Badge variant="secondary" className="h-5 min-w-5 justify-center px-1 text-[10px]">
        {cards.length}
      </Badge>
      <div className="h-[58px] w-[42px] overflow-hidden rounded border border-border/40 bg-background/40">
        {previewCard ? (
          <img
            src={previewSrc}
            alt={hideTopCard ? `${label} fechado` : previewCard.name}
            className="h-full w-full object-cover"
            draggable={!hideTopCard}
            onDragStart={(e) => {
              if (!hideTopCard) {
                e.stopPropagation();
                onDragStart(e, previewCard, zone);
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (!hideTopCard) onCardClick(previewCard, zone);
            }}
            onError={(e) => { (e.target as HTMLImageElement).src = MTG_CARD_BACK; }}
          />
        ) : null}
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
  className,
  cardSize,
  sleeveUrl,
  scrollable = false,
  showCardNames = true,
}: {
  zone: MagicZoneType;
  label: string;
  icon?: ReactNode;
  cards: MagicCard[];
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent, zone: MagicZoneType) => void;
  onCardClick: (card: MagicCard, zone: MagicZoneType) => void;
  onDragStart: (e: DragEvent, card: MagicCard, zone: MagicZoneType) => void;
  onTap?: (card: MagicCard) => void;
  className?: string;
  cardSize: CardSize;
  sleeveUrl?: string | null;
  scrollable?: boolean;
  showCardNames?: boolean;
}) => {
  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col rounded-lg border border-border/50 bg-card/45 p-2 backdrop-blur-[1px]',
        className
      )}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, zone)}
    >
      <div className="mb-1 flex items-center gap-1.5">
        {icon}
        <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
        <Badge variant="secondary" className="ml-auto h-5 min-w-5 justify-center px-1 text-[10px]">
          {cards.length}
        </Badge>
      </div>

      <div
        className={cn(
          'flex min-h-0 flex-1 flex-wrap content-start items-start gap-1',
          scrollable ? 'overflow-auto pr-1' : 'overflow-hidden'
        )}
      >
        {cards.length === 0 ? (
          <div className="flex h-full min-h-[40px] w-full items-center justify-center text-center text-xs italic text-muted-foreground/60">
            Arraste cartas aqui
          </div>
        ) : (
          cards.map((card) => (
            <CardSlot
              key={card.instanceId}
              card={card}
              zone={zone}
              onCardClick={onCardClick}
              onDragStart={onDragStart}
              onTap={onTap}
              size={cardSize}
              sleeveUrl={sleeveUrl}
              showName={showCardNames}
            />
          ))
        )}
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
  playmatUrl,
  sleeveUrl,
}: MagicFieldBoardProps) => {
  const [dragData, setDragData] = useState<{ card: MagicCard; zone: MagicZoneType } | null>(null);
  const [handSizeIndex, setHandSizeIndex] = useState(1);
  const [handExpanded, setHandExpanded] = useState(false);

  const handCardSize = HAND_CARD_SIZES[handSizeIndex];
  const baseFieldSize = FIELD_CARD_SIZES[Math.min(handSizeIndex + 1, FIELD_CARD_SIZES.length - 1)];

  const getAdaptiveFieldSize = (count: number): CardSize => {
    if (count >= 12) return FIELD_CARD_SIZES[0];
    if (count >= 8) return FIELD_CARD_SIZES[1];
    return baseFieldSize;
  };

  const handleDragStart = (e: DragEvent, card: MagicCard, zone: MagicZoneType) => {
    setDragData({ card, zone });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: DragEvent, zone: MagicZoneType) => {
    e.preventDefault();
    if (!dragData) return;
    onCardDrop(zone, dragData.card);
    setDragData(null);
  };

  const advancePhase = () => {
    const currentIdx = PHASES.findIndex((p) => p.key === currentPhase);
    const nextIdx = (currentIdx + 1) % PHASES.length;
    onPhaseChange(PHASES[nextIdx].key);
  };

  return (
    <div
      className="relative flex h-full flex-col gap-1.5 overflow-y-auto rounded-lg border border-border/50 p-2 sm:p-3"
      style={getPlaymatStyle(playmatUrl)}
    >
      {playmatUrl && <div className="pointer-events-none absolute inset-0 bg-background/50" />}

      <div className="relative z-10 flex items-center gap-0.5 overflow-x-auto rounded-md bg-background/90 backdrop-blur-sm border border-border/60 px-2 py-1.5">
        {PHASES.map((phase) => (
          <Button
            key={phase.key}
            variant={currentPhase === phase.key ? 'default' : 'ghost'}
            size="sm"
            className={cn(
              'h-6 flex-shrink-0 px-1.5 py-0.5 text-[9px] sm:text-[10px]',
              currentPhase === phase.key && 'shadow-sm'
            )}
            onClick={() => onPhaseChange(phase.key)}
            title={phase.label}
          >
            {phase.short}
          </Button>
        ))}

        <Button variant="outline" size="sm" className="ml-1 h-6 flex-shrink-0 px-2 text-[10px]" onClick={advancePhase}>
          <Zap className="mr-1 h-3 w-3" /> Next
        </Button>

        <div className="ml-auto flex items-center gap-0.5 pl-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setHandSizeIndex((value) => Math.max(0, value - 1))}
            disabled={handSizeIndex === 0}
            title="Diminuir tamanho da mão"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="w-4 text-center text-[9px] text-muted-foreground">{handSizeIndex + 1}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setHandSizeIndex((value) => Math.min(HAND_CARD_SIZES.length - 1, value + 1))}
            disabled={handSizeIndex === HAND_CARD_SIZES.length - 1}
            title="Aumentar tamanho da mão"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {fieldState.stack.length > 0 && (
        <div className="relative z-10 h-[84px] flex-shrink-0">
          <DropZone
            zone="stack"
            label="Stack"
            icon={<Layers className="h-3 w-3" />}
            cards={fieldState.stack}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onCardClick={onCardClick}
            onDragStart={handleDragStart}
            cardSize={getAdaptiveFieldSize(fieldState.stack.length)}
            sleeveUrl={sleeveUrl}
            showCardNames={false}
          />
        </div>
      )}

      <div className="relative z-10 flex flex-col gap-1.5">
        <DropZone
          zone="battlefield"
          label="Battlefield"
          icon={<Flame className="h-3 w-3" />}
          cards={fieldState.battlefield}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onCardClick={onCardClick}
          onDragStart={handleDragStart}
          onTap={onTapCard}
          cardSize={getAdaptiveFieldSize(fieldState.battlefield.length)}
          sleeveUrl={sleeveUrl}
        />

        <DropZone
          zone="lands"
          label="Lands"
          icon={<Droplets className="h-3 w-3" />}
          cards={fieldState.lands}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onCardClick={onCardClick}
          onDragStart={handleDragStart}
          onTap={onTapCard}
          cardSize={getAdaptiveFieldSize(fieldState.lands.length)}
          sleeveUrl={sleeveUrl}
        />

        <div className="grid grid-cols-[58px_minmax(0,1fr)] gap-1.5 items-start">
          <div className="flex flex-col gap-1">
            <CompactZone
              zone="library"
              label="Library"
              icon={<Layers className="h-3 w-3" />}
              cards={fieldState.library}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onCardClick={onCardClick}
              onDragStart={handleDragStart}
              onZoneClick={onZoneClick}
              hideTopCard
              sleeveUrl={sleeveUrl}
            />
            <CompactZone
              zone="graveyard"
              label="Grave"
              icon={<Skull className="h-3 w-3" />}
              cards={fieldState.graveyard}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onCardClick={onCardClick}
              onDragStart={handleDragStart}
              onZoneClick={onZoneClick}
              sleeveUrl={sleeveUrl}
            />
            <CompactZone
              zone="exile"
              label="Exile"
              icon={<Ban className="h-3 w-3" />}
              cards={fieldState.exile}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onCardClick={onCardClick}
              onDragStart={handleDragStart}
              onZoneClick={onZoneClick}
              sleeveUrl={sleeveUrl}
            />
          </div>

          <div className="min-w-0">
            <button
              className="mb-0.5 flex items-center gap-1 px-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setHandExpanded((value) => !value)}
              type="button"
            >
              {handExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
              Mão ({fieldState.hand.length}) — {handExpanded ? 'minimizar' : 'expandir'}
            </button>
            <div className={cn(handExpanded ? 'h-[min(32vh,220px)]' : 'h-[92px] sm:h-[104px]')}>
              <DropZone
                zone="hand"
                label="Mão"
                cards={fieldState.hand}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onCardClick={onCardClick}
                onDragStart={handleDragStart}
                cardSize={handCardSize}
                sleeveUrl={sleeveUrl}
                scrollable
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};