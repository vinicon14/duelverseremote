/**
 * DuelVerse - Pokémon Deck Builder
 * 
 * Deck builder integrado com a API Pokémon TCG.
 * Segue regras oficiais do Pokémon TCG:
 * - Deck de exatamente 60 cartas
 * - Máximo 4 cópias (exceto Energia Básica)
 * - Precisa de pelo menos 1 Pokémon Básico
 * - Categorias: Pokémon, Treinador, Energia
 */
import { useState, useEffect, useCallback } from 'react';
import { Navbar } from '@/components/Navbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, Plus, Minus, Trash2, Save, FolderOpen, Zap, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { SaveDeckModal } from '@/components/deckbuilder/SaveDeckModal';
import { LoadDeckModal } from '@/components/deckbuilder/LoadDeckModal';
import { useTranslation } from 'react-i18next';

interface PokemonCard {
  id: string;
  name: string;
  supertype: string;
  subtypes?: string[];
  types?: string[];
  hp?: string;
  evolvesFrom?: string;
  evolvesTo?: string[];
  rules?: string[];
  attacks?: { name: string; damage: string; text: string; cost: string[] }[];
  abilities?: { name: string; text: string; type: string }[];
  regulationMark?: string;
  rarity?: string;
  images: {
    small: string;
    large: string;
  };
  set: {
    name: string;
    id: string;
  };
  quantity?: number;
}

interface DeckCard extends PokemonCard {
  quantity: number;
}

const POKEMON_TYPES = [
  'All', 'Colorless', 'Darkness', 'Dragon', 'Fairy', 'Fighting',
  'Fire', 'Grass', 'Lightning', 'Metal', 'Psychic', 'Water'
];

const SUPERTYPES = ['All', 'Pokémon', 'Trainer', 'Energy'];

const SUBTYPES_TRAINER = ['All', 'Item', 'Supporter', 'Stadium', 'Tool'];

export default function PokemonDeckBuilder() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PokemonCard[]>([]);
  const [deck, setDeck] = useState<DeckCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState('All');
  const [supertypeFilter, setSupertypeFilter] = useState('All');
  const [subtypeFilter, setSubtypeFilter] = useState('All');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [savedDecks, setSavedDecks] = useState<any[]>([]);
  const [savingDeck, setSavingDeck] = useState(false);
  const [loadingDecks, setLoadingDecks] = useState(false);
  const [currentDeckId, setCurrentDeckId] = useState<string | null>(null);
  const [currentDeckName, setCurrentDeckName] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [previewCard, setPreviewCard] = useState<PokemonCard | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsLoggedIn(!!session);
    };
    checkAuth();
  }, []);

  const searchCards = useCallback(async () => {
    if (!searchQuery.trim() && typeFilter === 'All' && supertypeFilter === 'All') return;
    setLoading(true);
    try {
      let query = 'https://api.pokemontcg.io/v2/cards?pageSize=40&orderBy=-set.releaseDate';
      const filters: string[] = [];
      
      if (searchQuery.trim()) {
        filters.push(`name:"*${searchQuery.trim()}*"`);
      }
      if (typeFilter !== 'All') {
        filters.push(`types:"${typeFilter}"`);
      }
      if (supertypeFilter !== 'All') {
        filters.push(`supertype:"${supertypeFilter}"`);
        if (supertypeFilter === 'Trainer' && subtypeFilter !== 'All') {
          filters.push(`subtypes:"${subtypeFilter}"`);
        }
      }
      
      if (filters.length > 0) {
        query += `&q=${encodeURIComponent(filters.join(' '))}`;
      }

      const res = await fetch(query);
      const data = await res.json();
      setSearchResults(data.data || []);
    } catch (error) {
      toast({ title: 'Erro na busca', description: 'Não foi possível buscar cartas', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [searchQuery, typeFilter, supertypeFilter, subtypeFilter]);

  const addToDeck = (card: PokemonCard) => {
    const totalCards = deck.reduce((sum, c) => sum + c.quantity, 0);
    if (totalCards >= 60) {
      toast({ title: 'Deck cheio', description: 'O deck já tem 60 cartas', variant: 'destructive' });
      return;
    }

    const existing = deck.find(c => c.id === card.id);
    const isBasicEnergy = card.supertype === 'Energy' && card.subtypes?.includes('Basic');
    
    if (existing) {
      if (!isBasicEnergy && existing.quantity >= 4) {
        toast({ title: 'Limite atingido', description: 'Máximo 4 cópias por carta (exceto Energia Básica)', variant: 'destructive' });
        return;
      }
      setDeck(deck.map(c => c.id === card.id ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      setDeck([...deck, { ...card, quantity: 1 }]);
    }
  };

  const removeFromDeck = (cardId: string) => {
    setDeck(deck.map(c => {
      if (c.id === cardId) {
        if (c.quantity <= 1) return null as any;
        return { ...c, quantity: c.quantity - 1 };
      }
      return c;
    }).filter(Boolean));
  };

  const clearDeck = () => setDeck([]);

  const totalCards = deck.reduce((sum, c) => sum + c.quantity, 0);
  const pokemonCards = deck.filter(c => c.supertype === 'Pokémon');
  const pokemonCount = pokemonCards.reduce((s, c) => s + c.quantity, 0);
  const trainerCount = deck.filter(c => c.supertype === 'Trainer').reduce((s, c) => s + c.quantity, 0);
  const energyCount = deck.filter(c => c.supertype === 'Energy').reduce((s, c) => s + c.quantity, 0);
  
  // PKM validation
  const basicPokemonCount = pokemonCards
    .filter(c => c.subtypes?.includes('Basic'))
    .reduce((s, c) => s + c.quantity, 0);
  
  const hasBasicPokemon = basicPokemonCount > 0;
  const isDeckComplete = totalCards === 60;
  const isDeckValid = isDeckComplete && hasBasicPokemon;

  // Check for evolution cards without their basic
  const evolutionWarnings: string[] = [];
  pokemonCards.forEach(card => {
    if (card.evolvesFrom && !pokemonCards.some(c => c.name === card.evolvesFrom)) {
      evolutionWarnings.push(`${card.name} evolui de ${card.evolvesFrom} (não está no deck)`);
    }
  });

  const saveDeck = async (name: string, description: string, isPublic: boolean) => {
    setSavingDeck(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      const deckData = {
        user_id: user.id,
        name,
        description,
        is_public: isPublic,
        tcg_type: 'pokemon',
        main_deck: JSON.parse(JSON.stringify(deck)),
        extra_deck: [] as any[],
        side_deck: [] as any[],
        tokens_deck: [] as any[],
      } as any;

      if (currentDeckId) {
        const { error } = await supabase.from('saved_decks').update(deckData).eq('id', currentDeckId);
        if (error) throw error;
        toast({ title: 'Deck atualizado!' });
      } else {
        const { data, error } = await supabase.from('saved_decks').insert(deckData).select().single();
        if (error) throw error;
        setCurrentDeckId(data.id);
        toast({ title: 'Deck salvo!' });
      }
      setCurrentDeckName(name);
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setSavingDeck(false);
    }
  };

  const loadSavedDecks = async () => {
    setLoadingDecks(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase.from('saved_decks')
        .select('*')
        .eq('user_id', user.id)
        .eq('tcg_type', 'pokemon')
        .order('updated_at', { ascending: false });
      if (!error) setSavedDecks(data || []);
    } finally {
      setLoadingDecks(false);
    }
  };

  const loadDeck = (savedDeck: any) => {
    const mainDeck = (savedDeck.main_deck as DeckCard[]) || [];
    setDeck(mainDeck);
    setCurrentDeckId(savedDeck.id);
    setCurrentDeckName(savedDeck.name);
    toast({ title: `Deck "${savedDeck.name}" carregado!` });
  };

  const deleteDeck = async (deckId: string) => {
    await supabase.from('saved_decks').delete().eq('id', deckId);
    setSavedDecks(savedDecks.filter(d => d.id !== deckId));
    if (currentDeckId === deckId) {
      setCurrentDeckId(null);
      setCurrentDeckName('');
    }
    toast({ title: 'Deck deletado' });
    return true;
  };

  const getSupertypeBadgeClass = (supertype: string) => {
    switch (supertype) {
      case 'Pokémon': return 'bg-primary/20 text-primary border-primary/30';
      case 'Trainer': return 'bg-accent/20 text-accent-foreground border-accent/30';
      case 'Energy': return 'bg-secondary/20 text-secondary-foreground border-secondary/30';
      default: return '';
    }
  };

  return (
    <div className="min-h-screen bg-transparent">
      <Navbar />
      <main className="container mx-auto px-4 pt-20 sm:pt-24 pb-12">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gradient-mystic mb-1 flex items-center gap-2">
            <Zap className="w-7 h-7" />
            {t('deckBuilder.title')} — PKM
          </h1>
          <p className="text-sm text-muted-foreground">
            {currentDeckName ? `${t('deckBuilder.deckName')}: ${currentDeckName}` : t('deckBuilder.empty')}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Search Panel */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex flex-wrap gap-2">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder={t('deckBuilder.searchCards')}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && searchCards()}
                    className="pl-9"
                  />
                </div>
              </div>
              <Select value={supertypeFilter} onValueChange={v => { setSupertypeFilter(v); setSubtypeFilter('All'); }}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPERTYPES.map(t => (
                    <SelectItem key={t} value={t}>{t === 'All' ? 'Categoria' : t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {supertypeFilter === 'Trainer' && (
                <Select value={subtypeFilter} onValueChange={setSubtypeFilter}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBTYPES_TRAINER.map(t => (
                      <SelectItem key={t} value={t}>{t === 'All' ? 'Subtipo' : t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {(supertypeFilter === 'All' || supertypeFilter === 'Pokémon') && (
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {POKEMON_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{t === 'All' ? 'Tipo' : t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button onClick={searchCards} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>

            {/* Results Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {searchResults.map(card => (
                <Card
                  key={card.id}
                  className="card-mystic cursor-pointer hover:border-primary/40 transition-all group overflow-hidden"
                  onClick={() => addToDeck(card)}
                >
                  <div className="relative">
                    <img
                      src={card.images.small}
                      alt={card.name}
                      className="w-full h-auto rounded-t-lg"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-background/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                      <Plus className="w-8 h-8 text-primary" />
                      <span className="text-[10px] text-muted-foreground">{t('deckBuilder.addCard')}</span>
                    </div>
                    {/* Quick preview on long press / right-click area */}
                    <button
                      className="absolute top-1 right-1 bg-background/70 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => { e.stopPropagation(); setPreviewCard(card); }}
                    >
                      <Search className="w-3 h-3" />
                    </button>
                  </div>
                  <CardContent className="p-2">
                    <p className="text-xs font-medium truncate">{card.name}</p>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      <Badge variant="outline" className={`text-[10px] ${getSupertypeBadgeClass(card.supertype)}`}>
                        {card.supertype}
                      </Badge>
                      {card.hp && <Badge variant="secondary" className="text-[10px]">{card.hp} HP</Badge>}
                      {card.subtypes?.includes('Basic') && (
                        <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-500">Básico</Badge>
                      )}
                      {card.evolvesFrom && (
                        <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400">
                          ↑ {card.evolvesFrom}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {searchResults.length === 0 && !loading && (
              <div className="text-center py-12 text-muted-foreground">
                <Zap className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Busque cartas Pokémon para começar</p>
                <p className="text-xs mt-1">Dica: busque por "Pikachu", "Charizard" ou filtre por tipo</p>
              </div>
            )}
          </div>

          {/* Deck Panel */}
          <div className="space-y-4">
            <Card className="card-mystic">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-bold text-lg">Deck ({totalCards}/60)</h2>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => { loadSavedDecks(); setShowLoadModal(true); }}>
                      <FolderOpen className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setShowSaveModal(true)} disabled={deck.length === 0}>
                      <Save className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={clearDeck} disabled={deck.length === 0}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="text-center p-2 rounded bg-primary/10">
                    <div className="text-sm font-bold text-primary">{pokemonCount}</div>
                    <div className="text-[10px] text-muted-foreground">Pokémon</div>
                  </div>
                  <div className="text-center p-2 rounded bg-accent/10">
                    <div className="text-sm font-bold text-accent-foreground">{trainerCount}</div>
                    <div className="text-[10px] text-muted-foreground">Treinador</div>
                  </div>
                  <div className="text-center p-2 rounded bg-secondary/20">
                    <div className="text-sm font-bold">{energyCount}</div>
                    <div className="text-[10px] text-muted-foreground">Energia</div>
                  </div>
                </div>

                {/* Validation */}
                <div className="space-y-1 mb-3">
                  <div className={`flex items-center gap-1.5 text-[11px] ${hasBasicPokemon ? 'text-green-500' : 'text-destructive'}`}>
                    {hasBasicPokemon ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                    {hasBasicPokemon
                      ? `${basicPokemonCount} Pokémon Básico(s)`
                      : 'Precisa de pelo menos 1 Pokémon Básico'}
                  </div>
                  <div className={`flex items-center gap-1.5 text-[11px] ${isDeckComplete ? 'text-green-500' : 'text-muted-foreground'}`}>
                    {isDeckComplete ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                    {isDeckComplete ? 'Deck completo (60/60)' : `Faltam ${60 - totalCards} cartas`}
                  </div>
                  {evolutionWarnings.map((w, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[11px] text-yellow-500">
                      <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{w}</span>
                    </div>
                  ))}
                </div>

                {/* Progress bar */}
                <div className="w-full bg-muted rounded-full h-2 mb-4">
                  <div
                    className={`h-2 rounded-full transition-all ${isDeckValid ? 'bg-green-500' : 'bg-primary'}`}
                    style={{ width: `${Math.min(100, (totalCards / 60) * 100)}%` }}
                  />
                </div>

                <ScrollArea className="h-[400px]">
                  <div className="space-y-1 pr-2">
                    {/* Group by supertype */}
                    {['Pokémon', 'Trainer', 'Energy'].map(supertype => {
                      const groupCards = deck.filter(c => c.supertype === supertype);
                      if (groupCards.length === 0) return null;
                      return (
                        <div key={supertype}>
                          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1 py-1 border-b border-border/50 mb-1">
                            {supertype === 'Pokémon' ? '⚡ Pokémon' : supertype === 'Trainer' ? '🎒 Treinador' : '🔋 Energia'}
                            {' '}({groupCards.reduce((s, c) => s + c.quantity, 0)})
                          </div>
                          {groupCards.map(card => (
                            <div key={card.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 group">
                              <img
                                src={card.images.small}
                                alt={card.name}
                                className="w-8 h-11 rounded object-cover cursor-pointer"
                                onClick={() => setPreviewCard(card)}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{card.name}</p>
                                <div className="flex gap-1">
                                  {card.subtypes?.includes('Basic') && (
                                    <span className="text-[9px] text-green-500">Básico</span>
                                  )}
                                  {card.evolvesFrom && (
                                    <span className="text-[9px] text-blue-400">↑{card.evolvesFrom}</span>
                                  )}
                                  {!card.subtypes?.includes('Basic') && !card.evolvesFrom && (
                                    <span className="text-[9px] text-muted-foreground">{card.subtypes?.[0] || card.supertype}</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeFromDeck(card.id)}>
                                  <Minus className="w-3 h-3" />
                                </Button>
                                <span className="text-xs font-bold w-4 text-center">{card.quantity}</span>
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => addToDeck(card)}>
                                  <Plus className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Card Preview Modal */}
      <Dialog open={!!previewCard} onOpenChange={() => setPreviewCard(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{previewCard?.name}</DialogTitle>
          </DialogHeader>
          {previewCard && (
            <div className="space-y-3">
              <img src={previewCard.images.large} alt={previewCard.name} className="w-full rounded-lg" />
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline">{previewCard.supertype}</Badge>
                {previewCard.subtypes?.map(st => (
                  <Badge key={st} variant="secondary" className="text-xs">{st}</Badge>
                ))}
                {previewCard.hp && <Badge>HP {previewCard.hp}</Badge>}
                {previewCard.types?.map(t => (
                  <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                ))}
              </div>
              {previewCard.evolvesFrom && (
                <p className="text-xs text-muted-foreground">Evolui de: {previewCard.evolvesFrom}</p>
              )}
              {previewCard.rarity && (
                <p className="text-xs text-muted-foreground">Raridade: {previewCard.rarity}</p>
              )}
              <p className="text-xs text-muted-foreground">Set: {previewCard.set.name}</p>
              <Button className="w-full" onClick={() => { addToDeck(previewCard); setPreviewCard(null); }}>
                <Plus className="w-4 h-4 mr-1" /> Adicionar ao Deck
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <SaveDeckModal
        open={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onSave={saveDeck}
        isLoading={savingDeck}
        existingName={currentDeckName}
        isUpdate={!!currentDeckId}
      />

      <LoadDeckModal
        open={showLoadModal}
        onClose={() => setShowLoadModal(false)}
        onLoad={loadDeck}
        onDelete={deleteDeck}
        decks={savedDecks}
        isLoading={loadingDecks}
        isLoggedIn={isLoggedIn}
      />
    </div>
  );
}

