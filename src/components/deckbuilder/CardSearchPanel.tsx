import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Search, Filter, X, Loader2 } from 'lucide-react';
import { CardFilters, Language, useYugiohCards } from '@/hooks/useYugiohCards';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface CardSearchPanelProps {
  language: Language;
  onCardClick: (card: any) => void;
}

export const CardSearchPanel = ({ language, onCardClick }: CardSearchPanelProps) => {
  const { cards, loading, error, searchCards, CARD_TYPES, ATTRIBUTES, MONSTER_RACES, SPELL_RACES, TRAP_RACES } = useYugiohCards();
  const [filters, setFilters] = useState<CardFilters>({ name: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('');

  const handleSearch = () => {
    if (filters.name || filters.type || filters.race || filters.attribute || filters.archetype) {
      searchCards(filters, language);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const clearFilters = () => {
    setFilters({ name: '' });
    setSelectedType('');
  };

  const getRacesForType = () => {
    if (selectedType.includes('Spell')) return SPELL_RACES;
    if (selectedType.includes('Trap')) return TRAP_RACES;
    return MONSTER_RACES;
  };

  const isMonsterType = !selectedType.includes('Spell') && !selectedType.includes('Trap') && selectedType !== '';

  const labels = {
    en: {
      searchPlaceholder: 'Search card name...',
      search: 'Search',
      filters: 'Filters',
      clearFilters: 'Clear',
      type: 'Type',
      attribute: 'Attribute',
      race: 'Race/Type',
      level: 'Level',
      atk: 'ATK',
      def: 'DEF',
      noResults: 'No cards found',
      loading: 'Searching...',
      selectType: 'Select type',
      selectAttr: 'Select attribute',
      selectRace: 'Select race',
    },
    pt: {
      searchPlaceholder: 'Buscar nome da carta...',
      search: 'Buscar',
      filters: 'Filtros',
      clearFilters: 'Limpar',
      type: 'Tipo',
      attribute: 'Atributo',
      race: 'Raça/Tipo',
      level: 'Nível',
      atk: 'ATK',
      def: 'DEF',
      noResults: 'Nenhuma carta encontrada',
      loading: 'Buscando...',
      selectType: 'Selecionar tipo',
      selectAttr: 'Selecionar atributo',
      selectRace: 'Selecionar raça',
    },
  };

  const t = labels[language];

  return (
    <div className="flex flex-col h-full">
      {/* Search Bar */}
      <div className="p-3 border-b border-border space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder={t.searchPlaceholder}
            value={filters.name || ''}
            onChange={(e) => setFilters({ ...filters, name: e.target.value })}
            onKeyDown={handleKeyDown}
            className="flex-1"
          />
          <Button onClick={handleSearch} disabled={loading} size="icon">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>

        <Collapsible open={showFilters} onOpenChange={setShowFilters}>
          <div className="flex items-center justify-between">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <Filter className="h-4 w-4" />
                {t.filters}
              </Button>
            </CollapsibleTrigger>
            {(filters.type || filters.race || filters.attribute) && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-muted-foreground">
                <X className="h-3 w-3" />
                {t.clearFilters}
              </Button>
            )}
          </div>

          <CollapsibleContent className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">{t.type}</Label>
                <Select
                  value={filters.type || ''}
                  onValueChange={(v) => {
                    setSelectedType(v);
                    setFilters({ ...filters, type: v || undefined, race: undefined });
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={t.selectType} />
                  </SelectTrigger>
                  <SelectContent>
                    {CARD_TYPES.map((type) => (
                      <SelectItem key={type} value={type} className="text-xs">
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {isMonsterType && (
                <div className="space-y-1">
                  <Label className="text-xs">{t.attribute}</Label>
                  <Select
                    value={filters.attribute || ''}
                    onValueChange={(v) => setFilters({ ...filters, attribute: v || undefined })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder={t.selectAttr} />
                    </SelectTrigger>
                    <SelectContent>
                      {ATTRIBUTES.map((attr) => (
                        <SelectItem key={attr} value={attr} className="text-xs">
                          {attr}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-xs">{t.race}</Label>
                <Select
                  value={filters.race || ''}
                  onValueChange={(v) => setFilters({ ...filters, race: v || undefined })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={t.selectRace} />
                  </SelectTrigger>
                  <SelectContent>
                    {getRacesForType().map((race) => (
                      <SelectItem key={race} value={race} className="text-xs">
                        {race}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {isMonsterType && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">{t.level}</Label>
                    <Input
                      type="number"
                      min="1"
                      max="12"
                      value={filters.level || ''}
                      onChange={(e) => setFilters({ ...filters, level: e.target.value || undefined })}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t.atk}</Label>
                    <Input
                      type="number"
                      value={filters.atk || ''}
                      onChange={(e) => setFilters({ ...filters, atk: e.target.value || undefined })}
                      className="h-8 text-xs"
                      placeholder="ex: 2500"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t.def}</Label>
                    <Input
                      type="number"
                      value={filters.def || ''}
                      onChange={(e) => setFilters({ ...filters, def: e.target.value || undefined })}
                      className="h-8 text-xs"
                      placeholder="ex: 2000"
                    />
                  </div>
                </>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Results */}
      <ScrollArea className="flex-1">
        <div className="p-3">
          {error && (
            <p className="text-destructive text-sm text-center py-4">{error}</p>
          )}
          
          {!loading && cards.length === 0 && !error && (
            <p className="text-muted-foreground text-sm text-center py-8">
              {t.noResults}
            </p>
          )}

          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {cards.slice(0, 100).map((card) => (
              <div
                key={card.id}
                className="cursor-pointer hover:scale-105 transition-transform relative group"
                onClick={() => onCardClick(card)}
                title={card.name}
              >
                <img
                  src={card.card_images[0]?.image_url_small}
                  alt={card.name}
                  className="w-full rounded-sm shadow-md"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-sm flex items-end p-1">
                  <span className="text-[10px] text-white line-clamp-2 font-medium">
                    {card.name}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};
