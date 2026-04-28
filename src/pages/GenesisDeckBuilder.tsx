/**
 * DuelVerse - Genesis Deck Builder
 *
 * Formato Genesis (custom DuelVerse): usa o catálogo Yu-Gi-Oh! (ygoprodeck)
 * mas valida um ORÇAMENTO TOTAL DE PONTOS por deck. O custo de cada carta
 * vem da tabela `genesis_card_costs` (admin gerencia). Cartas sem custo
 * cadastrado contam como 0 pontos.
 *
 * Regras:
 *  - Main deck: 40-60 cartas
 *  - Extra deck: até 15 cartas
 *  - Side deck: até 15 cartas
 *  - Máximo 3 cópias por carta (igual Advanced)
 *  - Soma de pontos do deck inteiro <= GENESIS_BUDGET
 */
import { useState, useCallback, useEffect, useMemo } from 'react';
import { Navbar } from '@/components/Navbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, Plus, Minus, Save, Trash2, Loader2, FolderOpen, Sparkles, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { SaveDeckModal } from '@/components/deckbuilder/SaveDeckModal';
import { LoadDeckModal } from '@/components/deckbuilder/LoadDeckModal';
import { useTranslation } from 'react-i18next';

const GENESIS_BUDGET = 100; // total de pontos permitidos por deck

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
  card_images: { id: number; image_url: string; image_url_small: string; image_url_cropped?: string }[];
}

interface DeckCard extends YugiohCard {
  quantity: number;
}

const isExtraCard = (type: string) =>
  type.includes('Fusion') || type.includes('Synchro') || type.includes('XYZ') || type.includes('Link');

export default function GenesisDeckBuilder() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YugiohCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [mainDeck, setMainDeck] = useState<DeckCard[]>([]);
  const [extraDeck, setExtraDeck] = useState<DeckCard[]>([]);
  const [sideDeck, setSideDeck] = useState<DeckCard[]>([]);
  const [previewCard, setPreviewCard] = useState<YugiohCard | null>(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [savedDecks, setSavedDecks] = useState<any[]>([]);
  const [loadingDecks, setLoadingDecks] = useState(false);
  const [savingDeck, setSavingDeck] = useState(false);
  const [currentDeckId, setCurrentDeckId] = useState<string | null>(null);
  const [currentDeckName, setCurrentDeckName] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [costMap, setCostMap] = useState<Record<string, number>>({});
  const [target, setTarget] = useState<'main' | 'extra' | 'side'>('main');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setIsLoggedIn(!!session));
  }, []);

  // Carrega o mapa de custos uma vez (admin pode atualizar a qualquer momento)
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('genesis_card_costs').select('card_id, points');
      if (data) {
        const map: Record<string, number> = {};
        data.forEach((r: any) => { map[String(r.card_id)] = r.points || 0; });
        setCostMap(map);
      }
    })();
  }, []);

  const getCost = useCallback((cardId: number) => costMap[String(cardId)] ?? 0, [costMap]);

  const totalMain = useMemo(() => mainDeck.reduce((s, c) => s + c.quantity, 0), [mainDeck]);
  const totalExtra = useMemo(() => extraDeck.reduce((s, c) => s + c.quantity, 0), [extraDeck]);
  const totalSide = useMemo(() => sideDeck.reduce((s, c) => s + c.quantity, 0), [sideDeck]);

  const totalPoints = useMemo(() => {
    const sumDeck = (deck: DeckCard[]) =>
      deck.reduce((s, c) => s + getCost(c.id) * c.quantity, 0);
    return sumDeck(mainDeck) + sumDeck(extraDeck) + sumDeck(sideDeck);
  }, [mainDeck, extraDeck, sideDeck, getCost]);

  const overBudget = totalPoints > GENESIS_BUDGET;
  const deckValid = totalMain >= 40 && totalMain <= 60 && totalExtra <= 15 && totalSide <= 15 && !overBudget;

  const searchCards = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(query)}&num=40&offset=0`
      );
      if (!res.ok) {
        setResults([]);
        return;
      }
      const data = await res.json();
      setResults((data.data || []).slice(0, 40));
    } catch (err) {
      console.error(err);
      toast.error('Erro ao buscar cartas');
    } finally {
      setSearching(false);
    }
  }, [query]);

  const addToDeck = (card: YugiohCard, dest?: 'main' | 'extra' | 'side') => {
    const where = dest ?? (isExtraCard(card.type) ? 'extra' : target);
    const setter =
      where === 'main' ? setMainDeck : where === 'extra' ? setExtraDeck : setSideDeck;
    const total = where === 'main' ? totalMain : where === 'extra' ? totalExtra : totalSide;
    const limit = where === 'main' ? 60 : 15;

    if (total >= limit) {
      toast.error(`${where === 'main' ? 'Main' : where === 'extra' ? 'Extra' : 'Side'} deck cheio (max ${limit})`);
      return;
    }
    setter(prev => {
      const existing = prev.find(c => c.id === card.id);
      if (existing && existing.quantity >= 3) {
        toast.error('Máximo 3 cópias por carta');
        return prev;
      }
      if (existing) {
        return prev.map(c => (c.id === card.id ? { ...c, quantity: c.quantity + 1 } : c));
      }
      return [...prev, { ...card, quantity: 1 }];
    });
  };

  const removeFromDeck = (cardId: number, from: 'main' | 'extra' | 'side') => {
    const setter = from === 'main' ? setMainDeck : from === 'extra' ? setExtraDeck : setSideDeck;
    setter(prev =>
      prev
        .map(c => (c.id === cardId ? { ...c, quantity: c.quantity - 1 } : c))
        .filter(c => c.quantity > 0)
    );
  };

  const clearDeck = () => {
    setMainDeck([]);
    setExtraDeck([]);
    setSideDeck([]);
    setCurrentDeckId(null);
    setCurrentDeckName('');
  };

  const saveDeck = async (name: string, description: string, isPublic: boolean) => {
    setSavingDeck(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Faça login');
      if (totalMain < 40) throw new Error(`Main Deck precisa de no mínimo 40 cartas (atual: ${totalMain})`);
      if (totalMain > 60) throw new Error(`Main Deck máximo de 60 cartas (atual: ${totalMain})`);
      if (overBudget) throw new Error(`Orçamento estourado: ${totalPoints}/${GENESIS_BUDGET} pontos`);

      const deckData: any = {
        user_id: user.id,
        name,
        description,
        is_public: isPublic,
        tcg_type: 'genesis',
        main_deck: mainDeck as any,
        extra_deck: extraDeck as any,
        side_deck: sideDeck as any,
        tokens_deck: [] as any,
      };

      if (currentDeckId) {
        const { error } = await supabase.from('saved_decks').update(deckData).eq('id', currentDeckId);
        if (error) throw error;
        toast.success('Deck atualizado!');
      } else {
        const { data, error } = await supabase.from('saved_decks').insert(deckData).select().single();
        if (error) throw error;
        setCurrentDeckId(data.id);
        toast.success('Deck salvo!');
      }
      setCurrentDeckName(name);
      setShowSaveModal(false);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar deck');
    } finally {
      setSavingDeck(false);
    }
  };

  const loadSavedDecks = async () => {
    setLoadingDecks(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('saved_decks')
        .select('*')
        .eq('user_id', user.id)
        .eq('tcg_type', 'genesis')
        .order('updated_at', { ascending: false });
      setSavedDecks(data || []);
    } finally {
      setLoadingDecks(false);
    }
  };

  const loadDeck = (saved: any) => {
    setCurrentDeckId(saved.id);
    setCurrentDeckName(saved.name);
    setMainDeck((saved.main_deck as any) || []);
    setExtraDeck((saved.extra_deck as any) || []);
    setSideDeck((saved.side_deck as any) || []);
    setShowLoadModal(false);
  };

  const deleteDeckById = async (deckId: string) => {
    const { error } = await supabase.from('saved_decks').delete().eq('id', deckId);
    if (error) {
      toast.error('Erro ao deletar');
      return false;
    }
    setSavedDecks(prev => prev.filter(d => d.id !== deckId));
    if (deckId === currentDeckId) clearDeck();
    toast.success('Deck deletado');
    return true;
  };

  const renderDeck = (deck: DeckCard[], from: 'main' | 'extra' | 'side') => (
    <ScrollArea className="h-[260px]">
      <div className="space-y-1 pr-2">
        {deck.length === 0 ? (
          <p className="text-center text-muted-foreground py-8 text-sm">Vazio</p>
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
              <Badge variant="outline" className="text-[9px] px-1 py-0">
                {getCost(card.id)} pt
              </Badge>
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
            <Sparkles className="w-7 h-7" />
            Genesis Deck Builder
          </h1>
          <p className="text-sm text-muted-foreground">
            {currentDeckName ? `Deck: ${currentDeckName}` : 'Deck vazio'} • Formato Genesis (orçamento de {GENESIS_BUDGET} pontos)
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <form
              onSubmit={e => { e.preventDefault(); searchCards(); }}
              className="flex gap-2"
            >
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar cartas Yu-Gi-Oh!..."
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button type="submit" disabled={searching}>
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </form>

            <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg flex-wrap">
              <span className="text-sm">Adicionar ao:</span>
              {(['main', 'extra', 'side'] as const).map(d => (
                <Button
                  key={d}
                  size="sm"
                  variant={target === d ? 'default' : 'outline'}
                  onClick={() => setTarget(d)}
                >
                  {d === 'main' ? 'Main' : d === 'extra' ? 'Extra' : 'Side'}
                </Button>
              ))}
              <span className="ml-auto text-xs text-muted-foreground">
                Cartas Extra (Fusion/Synchro/XYZ/Link) vão sempre para Extra Deck
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {results.map(card => (
                <Card
                  key={card.id}
                  className="card-mystic cursor-pointer hover:border-primary/40 relative"
                  onClick={() => addToDeck(card)}
                >
                  <img
                    src={card.card_images?.[0]?.image_url_small}
                    alt={card.name}
                    className="w-full h-auto rounded-t-lg"
                    loading="lazy"
                  />
                  <Badge className="absolute top-1 right-1 text-[10px]">
                    {getCost(card.id)} pt
                  </Badge>
                  <CardContent className="p-2">
                    <p className="text-xs font-medium truncate">{card.name}</p>
                    <Badge variant="outline" className="text-[10px]">{card.type}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
            {results.length === 0 && !searching && (
              <div className="text-center py-12 text-muted-foreground">
                <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Busque cartas para começar a montar seu deck Genesis</p>
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
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setShowSaveModal(true)}
                      disabled={mainDeck.length === 0}
                    >
                      <Save className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={clearDeck}
                      disabled={mainDeck.length === 0 && extraDeck.length === 0 && sideDeck.length === 0}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div
                  className={`flex items-center justify-between text-[11px] mb-2 p-2 rounded ${
                    overBudget ? 'bg-red-500/20 text-red-400' : 'bg-primary/10 text-primary'
                  }`}
                >
                  <span className="flex items-center gap-1">
                    {overBudget ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                    Orçamento
                  </span>
                  <span className="font-mono">{totalPoints} / {GENESIS_BUDGET} pt</span>
                </div>

                <div
                  className={`flex items-center justify-between text-[11px] mb-3 p-2 rounded ${
                    deckValid ? 'bg-green-500/20 text-green-500' : 'bg-yellow-500/20 text-yellow-500'
                  }`}
                >
                  {deckValid ? (
                    <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Deck válido</span>
                  ) : (
                    <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Main 40-60</span>
                  )}
                  <span>{totalMain} main • {totalExtra} extra • {totalSide} side</span>
                </div>

                <Tabs defaultValue="main">
                  <TabsList className="w-full">
                    <TabsTrigger value="main" className="flex-1">Main ({totalMain})</TabsTrigger>
                    <TabsTrigger value="extra" className="flex-1">Extra ({totalExtra})</TabsTrigger>
                    <TabsTrigger value="side" className="flex-1">Side ({totalSide})</TabsTrigger>
                  </TabsList>
                  <TabsContent value="main" className="mt-2">{renderDeck(mainDeck, 'main')}</TabsContent>
                  <TabsContent value="extra" className="mt-2">{renderDeck(extraDeck, 'extra')}</TabsContent>
                  <TabsContent value="side" className="mt-2">{renderDeck(sideDeck, 'side')}</TabsContent>
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
                <Badge className="ml-auto">{getCost(previewCard.id)} pt</Badge>
              </div>
              <p className="text-xs text-muted-foreground max-h-32 overflow-y-auto">{previewCard.desc}</p>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => { addToDeck(previewCard, 'main'); setPreviewCard(null); }}>
                  <Plus className="w-4 h-4 mr-1" /> Main
                </Button>
                {isExtraCard(previewCard.type) && (
                  <Button variant="outline" className="flex-1" onClick={() => { addToDeck(previewCard, 'extra'); setPreviewCard(null); }}>
                    Extra
                  </Button>
                )}
                <Button variant="outline" className="flex-1" onClick={() => { addToDeck(previewCard, 'side'); setPreviewCard(null); }}>
                  Side
                </Button>
              </div>
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
        onDelete={deleteDeckById}
        isLoading={loadingDecks}
        isLoggedIn={isLoggedIn}
      />
    </div>
  );
}
