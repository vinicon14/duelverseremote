import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CardEffectModal } from '@/components/duel/CardEffectModal';
import { 
  Layers, 
  Flame, 
  Ban, 
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  X,
  Minimize2,
  Hand,
  Move,
  Sparkles,
  Star,
  Trash2,
  Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useDraggable } from '@/hooks/useDraggable';
import { MTG_CARD_BACK } from './mtgCardImage';


interface OpponentCard {
  id: number;
  name: string;
  image: string;
  isFaceDown?: boolean;
  materials?: number;
  position?: string;
  isTapped?: boolean;
  counters?: number;
  energyAttached?: number;
  damageCounters?: number;
  // YGO
  atk?: number;
  def?: number;
  desc?: string;
  type?: string;
  race?: string;
  // MTG
  power?: string;
  toughness?: string;
  oracle_text?: string;
  type_line?: string;
  mana_cost?: string;
  // PKM
  hp?: string;
  types?: string[];
  supertype?: string;
  attacks?: { name: string; damage: string; text: string; cost: string[] }[];
  abilities?: { name: string; text: string; type: string }[];
  rules?: string[];
}

interface ZoneCards {
  monster1: OpponentCard | null;
  monster2: OpponentCard | null;
  monster3: OpponentCard | null;
  monster4: OpponentCard | null;
  monster5: OpponentCard | null;
}

interface SpellZoneCards {
  spell1: OpponentCard | null;
  spell2: OpponentCard | null;
  spell3: OpponentCard | null;
  spell4: OpponentCard | null;
  spell5: OpponentCard | null;
}

interface ExtraMonsterZones {
  extraMonster1: OpponentCard | null;
  extraMonster2: OpponentCard | null;
}

interface OpponentState {
  hand: number;
  field: OpponentCard[];
  monsterZones?: ZoneCards;
  spellZones?: SpellZoneCards;
  extraMonsterZones?: ExtraMonsterZones;
  fieldSpell?: OpponentCard | null;
  graveyard: OpponentCard[];
  banished: OpponentCard[];
  deckCount: number;
  extraCount: number;
  tcgType?: string;
  // MTG-specific
  battlefield?: OpponentCard[];
  lands?: OpponentCard[];
  exile?: OpponentCard[];
  stack?: OpponentCard[];
  commandZone?: OpponentCard[];
  phase?: string;
  // PKM-specific
  active?: OpponentCard | null;
  bench?: OpponentCard[];
  prizeCardsCount?: number;
  discardCount?: number;
  pkmDiscard?: OpponentCard[];
  stadium?: OpponentCard | null;
  // Equipment
  playmatUrl?: string | null;
  sleeveUrl?: string | null;
}

interface FloatingOpponentViewerProps {
  duelId: string;
  currentUserId: string;
   opponentUsername?: string;
  hasOpponent?: boolean;
}

const buildPkmEffectText = (card: OpponentCard): string => {
  const parts: string[] = [];
  if (card.abilities && card.abilities.length > 0) {
    card.abilities.forEach(a => parts.push(`[${a.type}] ${a.name}: ${a.text}`));
  }
  if (card.attacks && card.attacks.length > 0) {
    card.attacks.forEach(a => {
      const cost = a.cost?.length ? `[${a.cost.join(',')}] ` : '';
      const dmg = a.damage ? ` — ${a.damage}` : '';
      parts.push(`${cost}${a.name}${dmg}: ${a.text || ''}`);
    });
  }
  if (card.rules && card.rules.length > 0) {
    card.rules.forEach(r => parts.push(r));
  }
  return parts.join('\n\n');
};

const YGO_CARD_BACK_URL = 'https://images.ygoprodeck.com/images/cards/back_high.jpg';
const PKM_CARD_BACK_URL = 'https://images.pokemontcg.io/back.png';

const getCardBack = (tcgType?: string, sleeveUrl?: string | null) => {
  if (sleeveUrl) return sleeveUrl;
  if (tcgType === 'magic') return MTG_CARD_BACK;
  if (tcgType === 'pokemon') return PKM_CARD_BACK_URL;
  return YGO_CARD_BACK_URL;
};

export const FloatingOpponentViewer = ({ 
  duelId, 
  currentUserId, 
  opponentUsername = 'Oponente',
  hasOpponent = true,
}: FloatingOpponentViewerProps) => {
  const [opponentState, setOpponentState] = useState<OpponentState | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true);
  const [isVisible, setIsVisible] = useState(true);
  const [selectedCard, setSelectedCard] = useState<OpponentCard | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const { position, isDragging, elementRef, dragHandlers } = useDraggable({
    initialPosition: { x: 8, y: 180 },
  });

  useEffect(() => {
    if (!duelId) return;

    const channel = supabase.channel(`deck-sync-${duelId}`);
    
    channel
      .on('broadcast', { event: 'deck-state' }, ({ payload }) => {
        if (payload.userId && payload.userId !== currentUserId) {
          if (payload.tcgType === 'magic') {
            setOpponentState({
              hand: payload.hand || 0,
              field: [],
              graveyard: payload.graveyard || [],
              banished: payload.exile || [],
              deckCount: payload.deckCount || 0,
              extraCount: payload.extraCount || 0,
              tcgType: 'magic',
              battlefield: payload.battlefield || [],
              lands: payload.lands || [],
              exile: payload.exile || [],
              stack: payload.stack || [],
              commandZone: payload.commandZone || [],
              phase: payload.phase,
              playmatUrl: payload.playmatUrl || null,
              sleeveUrl: payload.sleeveUrl || null,
            });
          } else if (payload.tcgType === 'pokemon') {
            setOpponentState({
              hand: payload.handCount || 0,
              field: [],
              graveyard: [],
              banished: [],
              deckCount: payload.deckCount || 0,
              extraCount: 0,
              tcgType: 'pokemon',
              active: payload.active ? {
                id: 0,
                name: payload.active.name,
                image: payload.active.images?.small || '',
                energyAttached: payload.active.energyAttached || 0,
                damageCounters: payload.active.damageCounters || 0,
                hp: payload.active.hp,
                types: payload.active.types,
                supertype: payload.active.supertype,
                attacks: payload.active.attacks,
                abilities: payload.active.abilities,
                rules: payload.active.rules,
              } : null,
              bench: (payload.bench || []).map((c: any, i: number) => ({
                id: i,
                name: c.name,
                image: c.images?.small || '',
                energyAttached: c.energyAttached || 0,
                damageCounters: c.damageCounters || 0,
                hp: c.hp,
                types: c.types,
                supertype: c.supertype,
                attacks: c.attacks,
                abilities: c.abilities,
                rules: c.rules,
              })),
              stadium: payload.stadium ? {
                id: 0,
                name: payload.stadium.name,
                image: payload.stadium.images?.small || '',
              } : null,
              prizeCardsCount: payload.prizeCardsCount || 0,
              discardCount: payload.discardCount || 0,
              pkmDiscard: (payload.discardCards || []).map((c: any) => ({ id: c.id || 0, name: c.name, image: c.image })),
              playmatUrl: payload.playmatUrl || null,
              sleeveUrl: payload.sleeveUrl || null,
            });
          } else {
            setOpponentState({
              hand: payload.hand || 0,
              field: payload.field || [],
              monsterZones: payload.monsterZones || undefined,
              spellZones: payload.spellZones || undefined,
              extraMonsterZones: payload.extraMonsterZones || undefined,
              fieldSpell: payload.fieldSpell || null,
              graveyard: payload.graveyard || [],
              banished: payload.banished || [],
              deckCount: payload.deckCount || 0,
              extraCount: payload.extraCount || 0,
              playmatUrl: payload.playmatUrl || null,
              sleeveUrl: payload.sleeveUrl || null,
            });
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [duelId, currentUserId]);

  if (!isVisible) {
    return (
      <Button
        variant="secondary"
        size="sm"
        className="fixed left-2 top-20 z-40 gap-2"
        onClick={() => setIsVisible(true)}
      >
        <Eye className="h-4 w-4" />
        Ver Deck Oponente
      </Button>
    );
  }

  if (isMinimized) {
    return (
      <div
        ref={elementRef}
        onClick={() => !isDragging && setIsMinimized(false)}
        className={cn(
          "fixed z-40 bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-lg flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors cursor-pointer",
          isDragging && "cursor-grabbing"
        )}
        style={{ left: position.x, top: position.y }}
        {...dragHandlers}
      >
        <Eye className="h-5 w-5 text-primary" />
        <span className="text-sm font-medium whitespace-nowrap">Ver deck do oponente</span>
      </div>
    );
  }

  const cardBack = getCardBack(opponentState?.tcgType, opponentState?.sleeveUrl);

  const ZoneSlotDisplay = ({ card, label }: { card: OpponentCard | null; label: string }) => (
    <div className={cn(
      "w-8 h-12 border border-dashed border-muted-foreground/30 rounded flex items-center justify-center",
      card && "border-solid border-primary/30"
    )}>
      {card ? (
        <div 
          className={cn(
            "relative w-full h-full cursor-pointer hover:opacity-80 transition-opacity",
            card.position?.toString().toLowerCase().startsWith('def') && "rotate-90"
          )}
          onClick={() => {
            if (!card.isFaceDown) {
              setSelectedCard(card);
              setModalOpen(true);
            }
          }}
        >
          <img
            src={card.isFaceDown ? cardBack : (card.image || cardBack)}
            alt={card.isFaceDown ? 'Carta virada' : card.name}
            title={card.isFaceDown ? 'Carta virada' : card.name}
            className="w-full h-full object-cover rounded"
          />
          {card.isFaceDown && (
            <div className="absolute top-0 right-0">
              <EyeOff className="h-2 w-2 text-destructive" />
            </div>
          )}
          {card.materials && card.materials > 0 && (
            <Badge className="absolute -bottom-1 -right-1 text-[6px] h-3 px-0.5 bg-yellow-600">
              {card.materials}
            </Badge>
          )}
          {/* ATK/DEF for YGO monsters */}
          {!card.isFaceDown && card.atk !== undefined && (
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 z-10">
              <div className="bg-background/90 border border-border text-[5px] font-bold px-0.5 rounded flex items-center gap-0.5 whitespace-nowrap">
                <span className="text-destructive">{card.atk}</span>
                <span className="text-muted-foreground">/</span>
                <span className="text-primary">{card.def ?? '?'}</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <span className="text-[6px] text-muted-foreground/50">{label}</span>
      )}
    </div>
  );

  const ZoneDisplay = ({ 
    title, 
    cards, 
    icon: Icon, 
    color,
    compact = false
  }: { 
    title: string; 
    cards: OpponentCard[]; 
    icon: typeof Layers;
    color: string;
    compact?: boolean;
  }) => (
    <div className="space-y-1">
      <div className="flex items-center gap-1 text-xs font-medium">
        <Icon className={cn("h-3 w-3", color)} />
        <span className={compact ? "hidden sm:inline" : ""}>{title}</span>
        <Badge variant="secondary" className="text-[10px] h-4 px-1">
          {cards.length}
        </Badge>
      </div>
      {cards.length > 0 && !isCollapsed && (
        <ScrollArea className="max-h-20">
          <div className="flex gap-1 flex-wrap">
            {cards.map((card, idx) => (
              <div 
                key={`${card.id}-${idx}`} 
                className="relative cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => {
                  setSelectedCard(card);
                  setModalOpen(true);
                }}
              >
                <img
                  src={card.isFaceDown ? cardBack : card.image}
                  alt={card.isFaceDown ? 'Face-down card' : card.name}
                  title={card.isFaceDown ? 'Carta virada' : card.name}
                  className={cn(
                    "w-10 h-auto rounded-sm shadow-sm hover:scale-110 transition-transform",
                    card.isTapped && "rotate-90"
                  )}
                />
                {card.materials && card.materials > 0 && (
                  <Badge className="absolute -bottom-1 -right-1 text-[8px] h-3 px-1 bg-yellow-600">
                    {card.materials}
                  </Badge>
                )}
                {card.counters && card.counters > 0 && (
                  <Badge className="absolute -top-1 -left-1 text-[8px] h-3 px-1 bg-accent">
                    {card.counters}
                  </Badge>
                )}
                {card.isFaceDown && (
                  <div className="absolute top-0 right-0">
                    <EyeOff className="h-2 w-2 text-red-500" />
                  </div>
                )}
                {/* P/T for MTG creatures */}
                {card.power && card.toughness && !card.isFaceDown && (
                  <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 z-10">
                    <div className="bg-background/90 border border-border text-[5px] font-bold px-0.5 py-0 rounded flex items-center gap-0.5 whitespace-nowrap">
                      <span className="text-destructive">{card.power}</span>
                      <span className="text-muted-foreground">/</span>
                      <span className="text-primary">{card.toughness}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );

  return (
    <div 
      ref={elementRef}
      className={cn(
        "fixed z-40 w-80 sm:w-96 bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-2xl overflow-hidden",
        isDragging && "cursor-grabbing"
      )}
      style={{ left: position.x, top: position.y }}
    >
      {/* Draggable Header */}
      <div 
        className="flex items-center justify-between p-2 border-b border-border bg-muted/30 cursor-grab hover:bg-muted/50"
        {...dragHandlers}
      >
        <div className="flex items-center gap-2">
          <Move className="h-3 w-3 text-muted-foreground" />
          <Eye className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Deck de {opponentUsername}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsMinimized(true)}>
            <Minimize2 className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsVisible(false)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-2">
        {!opponentState ? (
          <div className="text-center text-sm text-muted-foreground py-4">
            <Eye className="h-6 w-6 mx-auto mb-2 opacity-50" />
            <p>Aguardando o oponente carregar o deck virtual...</p>
            <p className="text-xs mt-1">O oponente precisa abrir a Arena Digital</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Stats Bar */}
            <div className="flex items-center justify-between gap-2 p-2 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-1">
                <Hand className="h-3 w-3 text-primary" />
                <span className="text-xs">Mão: {opponentState.hand}</span>
              </div>
              <div className="flex items-center gap-1">
                <Layers className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs">{opponentState.tcgType === 'magic' ? 'Grimório' : 'Deck'}: {opponentState.deckCount}</span>
              </div>
              {opponentState.tcgType === 'pokemon' && (
                <div className="flex items-center gap-1">
                  <Star className="h-3 w-3 text-yellow-500" />
                  <span className="text-xs">Prêmio: {opponentState.prizeCardsCount}</span>
                </div>
              )}
              {opponentState.tcgType !== 'magic' && opponentState.tcgType !== 'pokemon' && (
                <div className="flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-accent" />
                  <span className="text-xs">Extra: {opponentState.extraCount}</span>
                </div>
              )}
              {opponentState.tcgType === 'magic' && opponentState.phase && (
                <Badge variant="outline" className="text-[10px] h-4 px-1">{opponentState.phase}</Badge>
              )}
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setIsCollapsed(!isCollapsed)}>
                {isCollapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
              </Button>
            </div>

            {!isCollapsed && opponentState.tcgType === 'magic' && (
              <div
                className="space-y-2 p-2 rounded-lg relative overflow-hidden"
                style={{
                  backgroundImage: opponentState.playmatUrl ? `url("${opponentState.playmatUrl}")` : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundColor: opponentState.playmatUrl ? undefined : 'hsl(var(--muted) / 0.2)',
                }}
              >
                {opponentState.playmatUrl && (
                  <div className="absolute inset-0 bg-black/40 rounded-lg pointer-events-none z-0" />
                )}
                <div className="relative z-10">
                  <span className="text-[10px] font-medium text-muted-foreground">Campo MTG do Oponente</span>
                  {opponentState.battlefield && opponentState.battlefield.length > 0 && (
                    <ZoneDisplay title="Campo de Batalha" cards={opponentState.battlefield} icon={Layers} color="text-primary" />
                  )}
                  {opponentState.lands && opponentState.lands.length > 0 && (
                    <ZoneDisplay title="Terrenos" cards={opponentState.lands} icon={Layers} color="text-primary" />
                  )}
                  {opponentState.stack && opponentState.stack.length > 0 && (
                    <ZoneDisplay title="Pilha" cards={opponentState.stack} icon={Sparkles} color="text-accent" />
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <ZoneDisplay title="Cemitério" cards={opponentState.graveyard} icon={Flame} color="text-destructive" compact />
                    <ZoneDisplay title="Exílio" cards={opponentState.exile || []} icon={Ban} color="text-muted-foreground" compact />
                  </div>
                  {opponentState.commandZone && opponentState.commandZone.length > 0 && (
                    <ZoneDisplay title="Zona de Comando" cards={opponentState.commandZone} icon={Sparkles} color="text-accent" compact />
                  )}
                </div>
              </div>
            )}

            {/* PKM Field */}
            {!isCollapsed && opponentState.tcgType === 'pokemon' && (
              <div
                className="space-y-2 p-2 rounded-lg relative overflow-hidden"
                style={{
                  backgroundImage: opponentState.playmatUrl ? `url("${opponentState.playmatUrl}")` : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundColor: opponentState.playmatUrl ? undefined : 'hsl(var(--muted) / 0.2)',
                }}
              >
                {opponentState.playmatUrl && (
                  <div className="absolute inset-0 bg-black/40 rounded-lg pointer-events-none z-0" />
                )}
                <div className="relative z-10">
                  <span className="text-[10px] font-medium text-muted-foreground">Campo Pokémon do Oponente</span>
                  
                  {/* Stadium */}
                  {opponentState.stadium && (
                    <div className="flex items-center gap-1 mb-1">
                      <div className="w-8 h-12 rounded overflow-hidden border border-accent">
                        <img src={opponentState.stadium.image} alt={opponentState.stadium.name} className="w-full h-full object-cover" />
                      </div>
                      <span className="text-[8px] text-muted-foreground">{opponentState.stadium.name}</span>
                    </div>
                  )}
                  
                  {/* Active */}
                  <div className="flex justify-center">
                    {opponentState.active ? (
                      <div 
                        className="w-14 h-20 rounded-lg overflow-hidden border-2 border-primary relative cursor-pointer hover:opacity-80"
                        onClick={() => { setSelectedCard(opponentState.active!); setModalOpen(true); }}
                      >
                        <img src={opponentState.active.image} alt={opponentState.active.name} className="w-full h-full object-cover" />
                        {opponentState.active.hp && (
                          <Badge className="absolute top-0 left-0 text-[6px] h-3 px-0.5 bg-primary/80">
                            {opponentState.active.hp}HP
                          </Badge>
                        )}
                        {(opponentState.active.damageCounters || 0) > 0 && (
                          <Badge className="absolute -top-1 -right-1 text-[7px] h-3 px-0.5 bg-destructive">
                            {(opponentState.active.damageCounters || 0) * 10}
                          </Badge>
                        )}
                        {(opponentState.active.energyAttached || 0) > 0 && (
                          <Badge className="absolute -bottom-1 -right-1 text-[7px] h-3 px-0.5 bg-primary">
                            {opponentState.active.energyAttached}⚡
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <div className="w-14 h-20 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                        <span className="text-[8px] text-muted-foreground">Ativo</span>
                      </div>
                    )}
                  </div>

                  {/* Bench */}
                  <div className="flex justify-center gap-1 mt-1">
                    {(opponentState.bench || []).map((card, i) => (
                      <div key={i} className="w-10 h-14 rounded overflow-hidden border border-border relative cursor-pointer hover:opacity-80" onClick={() => { setSelectedCard(card); setModalOpen(true); }}>
                        <img src={card.image} alt={card.name} className="w-full h-full object-cover" />
                        {(card.damageCounters || 0) > 0 && (
                          <Badge className="absolute -top-0.5 -right-0.5 text-[6px] h-2.5 px-0.5 bg-destructive">
                            {(card.damageCounters || 0) * 10}
                          </Badge>
                        )}
                        {(card.energyAttached || 0) > 0 && (
                          <Badge className="absolute -bottom-0.5 -right-0.5 text-[6px] h-2.5 px-0.5 bg-primary">
                            {card.energyAttached}⚡
                          </Badge>
                        )}
                      </div>
                    ))}
                    {Array.from({ length: Math.max(0, 5 - (opponentState.bench?.length || 0)) }).map((_, i) => (
                      <div key={`empty-${i}`} className="w-10 h-14 rounded border border-dashed border-border/30" />
                    ))}
                  </div>

                  {/* Discard pile */}
                  {(opponentState.pkmDiscard && opponentState.pkmDiscard.length > 0) ? (
                    <ZoneDisplay title="Descarte" cards={opponentState.pkmDiscard} icon={Trash2} color="text-destructive" />
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <Trash2 className="h-3 w-3" />
                      <span>Descarte: {opponentState.discardCount || 0}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {!isCollapsed && opponentState.tcgType !== 'magic' && opponentState.tcgType !== 'pokemon' && (
              <>
                {/* YGO Field with opponent playmat */}
                {opponentState.monsterZones && (
                  <div
                    className="space-y-2 p-2 rounded-lg relative overflow-hidden"
                    style={{
                      backgroundImage: opponentState.playmatUrl ? `url("${opponentState.playmatUrl}")` : undefined,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      backgroundColor: opponentState.playmatUrl ? undefined : 'hsl(var(--muted) / 0.2)',
                    }}
                  >
                    {opponentState.playmatUrl && (
                      <div className="absolute inset-0 bg-black/40 rounded-lg pointer-events-none z-0" />
                    )}
                    <div className="relative z-10">
                      <span className="text-[10px] font-medium text-muted-foreground">Zonas de Campo do Oponente</span>
                      
                      {opponentState.extraMonsterZones && (
                        <div className="flex justify-center gap-8">
                          <ZoneSlotDisplay card={opponentState.extraMonsterZones.extraMonster1} label="EM1" />
                          <ZoneSlotDisplay card={opponentState.extraMonsterZones.extraMonster2} label="EM2" />
                        </div>
                      )}

                      <div className="flex justify-center gap-1">
                        <ZoneSlotDisplay card={opponentState.monsterZones.monster1} label="M1" />
                        <ZoneSlotDisplay card={opponentState.monsterZones.monster2} label="M2" />
                        <ZoneSlotDisplay card={opponentState.monsterZones.monster3} label="M3" />
                        <ZoneSlotDisplay card={opponentState.monsterZones.monster4} label="M4" />
                        <ZoneSlotDisplay card={opponentState.monsterZones.monster5} label="M5" />
                      </div>

                      {opponentState.spellZones && (
                        <div className="flex justify-center gap-1">
                          <ZoneSlotDisplay card={opponentState.spellZones.spell1} label="S1" />
                          <ZoneSlotDisplay card={opponentState.spellZones.spell2} label="S2" />
                          <ZoneSlotDisplay card={opponentState.spellZones.spell3} label="S3" />
                          <ZoneSlotDisplay card={opponentState.spellZones.spell4} label="S4" />
                          <ZoneSlotDisplay card={opponentState.spellZones.spell5} label="S5" />
                        </div>
                      )}

                      {opponentState.fieldSpell && (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">Campo:</span>
                          <ZoneSlotDisplay card={opponentState.fieldSpell} label="FS" />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {!opponentState.monsterZones && opponentState.field.length > 0 && (
                  <ZoneDisplay title="Campo" cards={opponentState.field} icon={Layers} color="text-primary" />
                )}

                <div className="grid grid-cols-2 gap-2">
                  <ZoneDisplay title="Cemitério" cards={opponentState.graveyard} icon={Flame} color="text-destructive" compact />
                  <ZoneDisplay title="Banido" cards={opponentState.banished} icon={Ban} color="text-muted-foreground" compact />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Card effect modal for opponent previews */}
      <CardEffectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        card={selectedCard ? {
          name: selectedCard.name,
          type: selectedCard.type_line || selectedCard.type || (selectedCard.supertype || '') + (selectedCard.types ? ' — ' + selectedCard.types.join('/') : ''),
          desc: selectedCard.oracle_text || selectedCard.desc || buildPkmEffectText(selectedCard),
          race: selectedCard.race || '',
          atk: selectedCard.atk,
          def: selectedCard.def,
          card_images: [{ image_url_small: selectedCard.image }],
          power: selectedCard.power,
          toughness: selectedCard.toughness,
          mana_cost: selectedCard.mana_cost,
          oracle_text: selectedCard.oracle_text,
          type_line: selectedCard.type_line,
          hp: selectedCard.hp,
          types: selectedCard.types,
          supertype: selectedCard.supertype,
        } : null}
      />
    </div>
  );
};
