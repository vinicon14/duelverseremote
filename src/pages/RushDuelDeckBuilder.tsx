/**
 * DuelVerse - Rush Duel Deck Builder
 * 
 * Deck builder usando YAML Yugi, que publica um JSON especifico de Rush Duel.
 * Regras DuelVerse: exatamente 40 cartas main, até 15 extra, até 15 side, máx 3 cópias por nome.
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Plus, Minus, Trash2, Save, FolderOpen, Zap, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { SaveDeckModal } from '@/components/deckbuilder/SaveDeckModal';
import { LoadDeckModal } from '@/components/deckbuilder/LoadDeckModal';
import { useTranslation } from 'react-i18next';

interface YugiohCard {
  id: number;
  name: string;
  type: string;
  desc: string;
  atk?: number;
  def?: number;
  level?: number;
  race: string;
  attribute?: string;
  archetype?: string;
  scale?: number;
  linkval?: number;
  card_images: {
    id: number;
    image_url: string;
    image_url_small: string;
    image_url_cropped: string;
  }[];
}

interface DeckCard extends YugiohCard {
  quantity: number;
}

const RUSH_DUEL_TYPES = ['All', 'Normal Monster', 'Effect Monster', 'Maximum Monster', 'Fusion Monster', 'Ritual Monster', 'Spell', 'Trap'];
const RUSH_ATTRIBUTES = ['All', 'DARK', 'DIVINE', 'EARTH', 'FIRE', 'LIGHT', 'WATER', 'WIND'];
const RUSH_MAIN_DECK_SIZE = 40;
const RUSH_CARDS_URL = 'https://dawnbrandbots.github.io/yaml-yugi/rush.json';

interface RushYamlCard {
  konami_id?: number;
  yugipedia_page_id?: number;
  name?: Record<string, string | null>;
  requirement?: Record<string, string | null>;
  effect?: Record<string, string | null>;
  card_type?: string;
  monster_type_line?: string;
  attribute?: string;
  level?: number;
  atk?: number;
  def?: number;
  property?: string;
  images?: { image?: string }[];
}

let rushCardCache: YugiohCard[] | null = null;

const stripHtml = (value?: string | null) => (value || '').replace(/<[^>]*>/g, '').trim();

const pickText = (field?: Record<string, string | null>) =>
  stripHtml(field?.en) || stripHtml(field?.pt) || stripHtml(field?.ja_romaji) || stripHtml(field?.ja) || '';

const getRushCardType = (card: RushYamlCard) => {
  if (card.card_type === 'Monster') {
    const line = card.monster_type_line || '';
    if (line.includes('Fusion')) return 'Fusion Monster';
    if (line.includes('Ritual')) return 'Ritual Monster';
    if (line.includes('Maximum')) return 'Maximum Monster';
    if (line.includes('Effect')) return 'Effect Monster';
    return 'Normal Monster';
  }

  if (card.card_type === 'Spell') return 'Spell';
  if (card.card_type === 'Trap') return 'Trap';
  return card.card_type || 'Card';
};

const getRushRace = (card: RushYamlCard) => {
  if (card.monster_type_line) return card.monster_type_line.split('/')[0].trim();
  return card.property || card.card_type || 'Rush Duel';
};

const getRushImageUrl = (card: RushYamlCard) => {
  const image = card.images?.[0]?.image;
  if (!image) return '/placeholder.svg';
  return `https://yugipedia.com/wiki/Special:Redirect/file/${encodeURIComponent(image)}`;
};

const normalizeRushCard = (card: RushYamlCard, index: number): YugiohCard => {
  const name = pickText(card.name) || `Rush Card ${card.konami_id || index + 1}`;
  const requirement = pickText(card.requirement);
  const effect = pickText(card.effect);
  const desc = [requirement && `Requirement: ${requirement}`, effect].filter(Boolean).join('\n\n');
  const imageUrl = getRushImageUrl(card);

  return {
    id: card.konami_id || card.yugipedia_page_id || index + 1,
    name,
    type: getRushCardType(card),
    desc,
    atk: card.atk,
    def: card.def,
    level: card.level,
    race: getRushRace(card),
    attribute: card.attribute,
    card_images: [{
      id: card.konami_id || card.yugipedia_page_id || index + 1,
      image_url: imageUrl,
      image_url_small: imageUrl,
      image_url_cropped: imageUrl,
    }],
  };
};

const loadRushCards = async () => {
  if (rushCardCache) return rushCardCache;

  const res = await fetch(RUSH_CARDS_URL);
  if (!res.ok) {
    throw new Error('Fonte Rush Duel indisponível no momento');
  }

  const data: RushYamlCard[] = await res.json();
  rushCardCache = data.map(normalizeRushCard);
  return rushCardCache;
};

export default function RushDuelDeckBuilder() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<YugiohCard[]>([]);
  const [mainDeck, setMainDeck] = useState<DeckCard[]>([]);
  const [extraDeck, setExtraDeck] = useState<DeckCard[]>([]);
  const [sideDeck, setSideDeck] = useState<DeckCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState('All');
  const [attributeFilter, setAttributeFilter] = useState('All');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [savedDecks, setSavedDecks] = useState<any[]>([]);
  const [savingDeck, setSavingDeck] = useState(false);
  const [loadingDecks, setLoadingDecks] = useState(false);
  const [currentDeckId, setCurrentDeckId] = useState<string | null>(null);
  const [currentDeckName, setCurrentDeckName] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [previewCard, setPreviewCard] = useState<YugiohCard | null>(null);
  const [addTo, setAddTo] = useState<'main' | 'extra' | 'side'>('main');

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsLoggedIn(!!session);
    };
    checkAuth();
  }, []);

  const searchCards = useCallback(async () => {
    if (!searchQuery.trim() && typeFilter === 'All' && attributeFilter === 'All') return;
    setLoading(true);
    try {
      const cards = await loadRushCards();
      const query = searchQuery.trim().toLowerCase();

      let filtered = query
        ? cards.filter(c =>
            c.name.toLowerCase().includes(query) ||
            c.race.toLowerCase().includes(query) ||
            c.type.toLowerCase().includes(query)
          )
        : cards;

      if (typeFilter !== 'All') {
        filtered = filtered.filter(c => c.type.includes(typeFilter));
      }
      if (attributeFilter !== 'All') {
        filtered = filtered.filter(c => c.attribute === attributeFilter);
      }
      
      setSearchResults(filtered.slice(0, 40));
    } catch (error) {
      console.error('Rush Duel search error:', error);
      toast({
        title: 'Erro na busca',
        description: error instanceof Error ? error.message : 'Não foi possível buscar cartas Rush Duel',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [searchQuery, typeFilter, attributeFilter, toast]);

  const getTotal = (deck: DeckCard[]) => deck.reduce((sum, c) => sum + c.quantity, 0);

  const isExtraCard = (type: string) => type.includes('Fusion') || type.includes('Ritual');

  const getTotalCopies = (cardName: string) => {
    const normalizedName = cardName.trim().toLowerCase();
    return [...mainDeck, ...extraDeck, ...sideDeck]
      .filter(c => c.name.trim().toLowerCase() === normalizedName)
      .reduce((sum, c) => sum + c.quantity, 0);
  };

  const addToDeck = (card: YugiohCard) => {
    if (addTo === 'extra' && !isExtraCard(card.type)) {
      toast({ title: 'Carta inválida', description: 'Apenas Fusion e Ritual podem ir para o Extra Deck', variant: 'destructive' });
      return;
    }

    const destination = addTo === 'side' ? 'side' : isExtraCard(card.type) ? 'extra' : 'main';
    const target = destination === 'main' ? mainDeck : destination === 'extra' ? extraDeck : sideDeck;
    const setTarget = destination === 'main' ? setMainDeck : destination === 'extra' ? setExtraDeck : setSideDeck;
    const total = getTotal(target);

    if (destination === 'main') {
      if (total >= RUSH_MAIN_DECK_SIZE) {
        toast({ title: 'Main Deck cheio', description: 'Máximo 40 cartas', variant: 'destructive' });
        return;
      }
    } else if (destination === 'extra') {
      if (total >= 15) {
        toast({ title: 'Extra Deck cheio', description: 'Máximo 15 cartas', variant: 'destructive' });
        return;
      }
    } else if (total >= 15) {
      toast({ title: 'Side Deck cheio', description: 'Máximo 15 cartas', variant: 'destructive' });
      return;
    }

    if (getTotalCopies(card.name) >= 3) {
      toast({ title: 'Limite atingido', description: 'Máximo 3 cópias por nome no deck inteiro', variant: 'destructive' });
      return;
    }

    const existing = target.find(c => c.id === card.id);
    setTarget(prev => prev.map(c => c.id === card.id ? { ...c, quantity: c.quantity + 1 } : c).concat(!existing ? { ...card, quantity: 1 } : []));
  };

  const removeFromDeck = (cardId: number, from: 'main' | 'extra' | 'side') => {
    if (from === 'main') {
      setMainDeck(prev => prev.map(c => c.id === cardId ? (c.quantity <= 1 ? null : { ...c, quantity: c.quantity - 1 }) : c).filter(Boolean) as DeckCard[]);
    } else if (from === 'extra') {
      setExtraDeck(prev => prev.map(c => c.id === cardId ? (c.quantity <= 1 ? null : { ...c, quantity: c.quantity - 1 }) : c).filter(Boolean) as DeckCard[]);
    } else {
      setSideDeck(prev => prev.map(c => c.id === cardId ? (c.quantity <= 1 ? null : { ...c, quantity: c.quantity - 1 }) : c).filter(Boolean) as DeckCard[]);
    }
  };

  const clearDeck = () => { setMainDeck([]); setExtraDeck([]); setSideDeck([]); setCurrentDeckId(null); setCurrentDeckName(''); };

  const totalMain = getTotal(mainDeck);
  const totalExtra = getTotal(extraDeck);
  const totalSide = getTotal(sideDeck);
  const isDeckComplete = totalMain === RUSH_MAIN_DECK_SIZE && totalExtra <= 15 && totalSide <= 15;

  const saveDeck = async (name: string, description: string, isPublic: boolean) => {
    setSavingDeck(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      if (totalMain !== RUSH_MAIN_DECK_SIZE) {
        toast({ title: 'Main Deck inválido', description: 'Rush Duel usa exatamente 40 cartas no Main Deck', variant: 'destructive' });
        setSavingDeck(false);
        return;
      }

      const deckData: any = { 
        user_id: user.id, 
        name, 
        description, 
        is_public: isPublic, 
        tcg_type: 'rush_duel', 
        main_deck: mainDeck as any, 
        extra_deck: extraDeck as any, 
        side_deck: sideDeck as any, 
        tokens_deck: [] as any 
      };
      
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
      const { data, error } = await supabase.from('saved_decks').select('*').eq('user_id', user.id).eq('tcg_type', 'rush_duel').order('updated_at', { ascending: false });
      if (!error) setSavedDecks(data || []);
    } finally {
      setLoadingDecks(false);
    }
  };

  const loadDeck = (savedDeck: any) => {
    setCurrentDeckId(savedDeck.id);
    setCurrentDeckName(savedDeck.name);
    setMainDeck(savedDeck.main_deck || []);
    setExtraDeck(savedDeck.extra_deck || []);
    setSideDeck(savedDeck.side_deck || []);
    setShowLoadModal(false);
  };

  const deleteDeck = async (deckId: string) => {
    const { error } = await supabase.from('saved_decks').delete().eq('id', deckId);
    if (error) return false;
    setSavedDecks(prev => prev.filter(d => d.id !== deckId));
    if (deckId === currentDeckId) clearDeck();
    toast({ title: 'Deck deletado' });
    return true;
  };

  const renderDeck = (deck: DeckCard[], from: 'main' | 'extra' | 'side') => (
    <ScrollArea className="h-[250px]">
      <div className="space-y-1 pr-2">
        {deck.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 text-sm">
            {from === 'main' ? 'Nenhuma carta no Main Deck' : from === 'extra' ? 'Nenhuma carta no Extra Deck' : 'Nenhuma carta no Side Deck'}
          </p>
        ) : (
          deck.map(card => (
            <div key={card.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50">
              <img 
                src={card.card_images?.[0]?.image_url_small} 
                alt={card.name} 
                className="w-8 h-11 rounded object-cover cursor-pointer" 
                onClick={() => setPreviewCard(card)} 
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{card.name}</p>
                <span className="text-[9px] text-muted-foreground">{card.type}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs font-medium w-6 text-center">{card.quantity}</span>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeFromDeck(card.id, from)}>
                  <Minus className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </ScrollArea>
  );

  return (
    <div className="min-h-screen bg-transparent">
      <Navbar />
      <main className="container mx-auto px-4 pt-20 sm:pt-24 pb-12">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gradient-mystic mb-1 flex items-center gap-2">
            <Zap className="w-7 h-7" />
            Rush Duel Deck Builder
          </h1>
          <p className="text-sm text-muted-foreground">
            {currentDeckName ? `Deck: ${currentDeckName}` : 'Deck vazio'} • Formato Rush Duel (SEVENS ROAD)
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="flex flex-wrap gap-2">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input 
                    placeholder="Buscar cartas Rush Duel... (ex: Yuga, Sevens Road)" 
                    value={searchQuery} 
                    onChange={e => setSearchQuery(e.target.value)} 
                    onKeyDown={e => e.key === 'Enter' && searchCards()} 
                    className="pl-9" 
                  />
                </div>
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RUSH_DUEL_TYPES.map(t => <SelectItem key={t} value={t}>{t === 'All' ? 'Tipo' : t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={attributeFilter} onValueChange={setAttributeFilter}>
                <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RUSH_ATTRIBUTES.map(t => <SelectItem key={t} value={t}>{t === 'All' ? 'Atributo' : t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button onClick={searchCards} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>

            <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
              <span className="text-sm">Adicionar ao:</span>
              <Button 
                size="sm" 
                variant={addTo === 'main' ? 'default' : 'outline'} 
                onClick={() => setAddTo('main')}
              >
                Main Deck
              </Button>
              <Button 
                size="sm" 
                variant={addTo === 'extra' ? 'default' : 'outline'} 
                onClick={() => setAddTo('extra')}
              >
                Extra Deck
              </Button>
              <Button 
                size="sm" 
                variant={addTo === 'side' ? 'default' : 'outline'} 
                onClick={() => setAddTo('side')}
              >
                Side Deck
              </Button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {searchResults.map(card => (
                <Card 
                  key={card.id} 
                  className="card-mystic cursor-pointer hover:border-primary/40" 
                  onClick={() => { addToDeck(card); }}
                >
                  <img 
                    src={card.card_images?.[0]?.image_url_small} 
                    alt={card.name} 
                    className="w-full h-auto rounded-t-lg" 
                    loading="lazy" 
                  />
                  <CardContent className="p-2">
                    <p className="text-xs font-medium truncate">{card.name}</p>
                    <Badge variant="outline" className="text-[10px]">{card.type}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
            {searchResults.length === 0 && !loading && (
              <div className="text-center py-12 text-muted-foreground">
                <Zap className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Busque cartas Rush Duel</p>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <Card className="card-mystic">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-bold text-lg">Deck</h2>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => { loadSavedDecks(); setShowLoadModal(true); }}>
                      <FolderOpen className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setShowSaveModal(true)} disabled={mainDeck.length === 0}>
                      <Save className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={clearDeck} disabled={mainDeck.length === 0 && extraDeck.length === 0 && sideDeck.length === 0}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className={`flex items-center justify-between text-[11px] mb-3 p-2 rounded ${isDeckComplete ? 'bg-green-500/20 text-green-500' : 'bg-yellow-500/20 text-yellow-500'}`}>
                  {isDeckComplete ? (
                    <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Deck válido</span>
                  ) : (
                    <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Main 40 cartas</span>
                  )}
                  <span>{totalMain} main • {totalExtra} extra • {totalSide} side</span>
                </div>

                <Tabs defaultValue="main">
                  <TabsList className="w-full">
                    <TabsTrigger value="main" className="flex-1">Main ({totalMain}/40)</TabsTrigger>
                    <TabsTrigger value="extra" className="flex-1">Extra ({totalExtra}/15)</TabsTrigger>
                    <TabsTrigger value="side" className="flex-1">Side ({totalSide}/15)</TabsTrigger>
                  </TabsList>
                  <TabsContent value="main" className="mt-2">
                    {renderDeck(mainDeck, 'main')}
                  </TabsContent>
                  <TabsContent value="extra" className="mt-2">
                    {renderDeck(extraDeck, 'extra')}
                  </TabsContent>
                  <TabsContent value="side" className="mt-2">
                    {renderDeck(sideDeck, 'side')}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <Dialog open={!!previewCard} onOpenChange={() => setPreviewCard(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{previewCard?.name}</DialogTitle></DialogHeader>
          {previewCard && (
            <div className="space-y-3">
              <img src={previewCard.card_images?.[0]?.image_url} alt={previewCard.name} className="w-full rounded-lg" />
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline">{previewCard.type}</Badge>
                {previewCard.level && <Badge variant="secondary">★{previewCard.level}</Badge>}
                {previewCard.atk !== undefined && <Badge>ATK {previewCard.atk}</Badge>}
                {previewCard.def !== undefined && <Badge>DEF {previewCard.def}</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">{previewCard.desc}</p>
              <Button className="w-full" onClick={() => { addToDeck(previewCard); setPreviewCard(null); }}>
                <Plus className="w-4 h-4 mr-1" /> Adicionar
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
        decks={savedDecks} 
        onLoad={loadDeck} 
        onDelete={deleteDeck} 
        isLoading={loadingDecks} 
        isLoggedIn={isLoggedIn} 
      />
    </div>
  );
}
