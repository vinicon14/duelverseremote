import { YugiohCard } from '@/hooks/useYugiohCards';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2, Download, Upload, Plus, Minus, Sparkles } from 'lucide-react';
import { Language } from '@/hooks/useYugiohCards';

export interface DeckCard extends YugiohCard {
  quantity: number;
}

interface DeckPanelProps {
  mainDeck: DeckCard[];
  extraDeck: DeckCard[];
  sideDeck: DeckCard[];
  tokensDeck: DeckCard[];
  language: Language;
  onRemoveCard: (cardId: number, deckType: 'main' | 'extra' | 'side' | 'tokens') => void;
  onAddQuantity: (cardId: number, deckType: 'main' | 'extra' | 'side' | 'tokens') => void;
  onRemoveQuantity: (cardId: number, deckType: 'main' | 'extra' | 'side' | 'tokens') => void;
  onClearDeck: () => void;
  onExportDeck: () => void;
  onImportDeck: () => void;
  onCardClick: (card: YugiohCard) => void;
}

const labels = {
  en: {
    mainDeck: 'Main Deck',
    extraDeck: 'Extra Deck',
    sideDeck: 'Side Deck',
    tokensDeck: 'Tokens',
    clearAll: 'Clear All',
    export: 'Export',
    import: 'Import',
    cards: 'cards',
  },
  pt: {
    mainDeck: 'Deck Principal',
    extraDeck: 'Deck Extra',
    sideDeck: 'Side Deck',
    tokensDeck: 'Fichas',
    clearAll: 'Limpar Tudo',
    export: 'Exportar',
    import: 'Importar',
    cards: 'cartas',
  },
};

export const DeckPanel = ({
  mainDeck,
  extraDeck,
  sideDeck,
  tokensDeck,
  language,
  onRemoveCard,
  onAddQuantity,
  onRemoveQuantity,
  onClearDeck,
  onExportDeck,
  onImportDeck,
  onCardClick,
}: DeckPanelProps) => {
  const t = labels[language];
  
  const mainCount = mainDeck.reduce((acc, c) => acc + c.quantity, 0);
  const extraCount = extraDeck.reduce((acc, c) => acc + c.quantity, 0);
  const sideCount = sideDeck.reduce((acc, c) => acc + c.quantity, 0);
  const tokensCount = tokensDeck.reduce((acc, c) => acc + c.quantity, 0);

  const DeckSection = ({
    title,
    cards,
    deckType,
    maxCards,
    count,
    icon,
  }: {
    title: string;
    cards: DeckCard[];
    deckType: 'main' | 'extra' | 'side' | 'tokens';
    maxCards: number;
    count: number;
    icon?: React.ReactNode;
  }) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-1">
          {icon}
          {title}
        </h3>
        <Badge variant={count > maxCards ? 'destructive' : 'secondary'} className="text-xs">
          {count}/{maxCards}
        </Badge>
      </div>
      <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-1 min-h-[80px] p-2 bg-muted/30 rounded-lg border border-border/50">
        {cards.map((card) => (
          Array.from({ length: card.quantity }).map((_, idx) => (
            <div
              key={`${card.id}-${idx}`}
              className="relative group cursor-pointer"
              onClick={() => onCardClick(card)}
            >
              <img
                src={card.card_images[0]?.image_url_small}
                alt={card.name}
                className="w-full rounded-sm shadow-sm hover:shadow-lg transition-shadow"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity rounded-sm flex flex-col items-center justify-center gap-1">
                <div className="flex gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveQuantity(card.id, deckType);
                    }}
                    className="p-1 bg-destructive rounded-full hover:bg-destructive/80"
                  >
                    <Minus className="h-3 w-3 text-white" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddQuantity(card.id, deckType);
                    }}
                    className="p-1 bg-primary rounded-full hover:bg-primary/80"
                  >
                    <Plus className="h-3 w-3 text-white" />
                  </button>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveCard(card.id, deckType);
                  }}
                  className="p-1 bg-destructive rounded-full hover:bg-destructive/80"
                >
                  <Trash2 className="h-3 w-3 text-white" />
                </button>
              </div>
              {idx === 0 && card.quantity > 1 && (
                <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]">
                  {card.quantity}
                </Badge>
              )}
            </div>
          ))
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="p-3 border-b border-border flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onExportDeck} className="gap-1">
            <Download className="h-3 w-3" />
            {t.export}
          </Button>
          <Button variant="outline" size="sm" onClick={onImportDeck} className="gap-1">
            <Upload className="h-3 w-3" />
            {t.import}
          </Button>
        </div>
        <Button variant="destructive" size="sm" onClick={onClearDeck} className="gap-1">
          <Trash2 className="h-3 w-3" />
          {t.clearAll}
        </Button>
      </div>

      {/* Deck Sections */}
      <ScrollArea className="flex-1 p-3">
        <div className="space-y-4">
          <DeckSection
            title={t.mainDeck}
            cards={mainDeck}
            deckType="main"
            maxCards={60}
            count={mainCount}
          />
          <DeckSection
            title={t.extraDeck}
            cards={extraDeck}
            deckType="extra"
            maxCards={15}
            count={extraCount}
          />
          <DeckSection
            title={t.sideDeck}
            cards={sideDeck}
            deckType="side"
            maxCards={15}
            count={sideCount}
          />
          <DeckSection
            title={t.tokensDeck}
            cards={tokensDeck}
            deckType="tokens"
            maxCards={5}
            count={tokensCount}
            icon={<Sparkles className="h-3 w-3 text-yellow-500" />}
          />
        </div>
      </ScrollArea>
    </div>
  );
};
