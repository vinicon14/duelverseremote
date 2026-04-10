/**
 * DuelVerse - Magic: The Gathering Deck Builder
 * 
 * Interface para criar decks de MTG usando a API Scryfall.
 */
import { useState, useCallback, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Minus, Save, Trash2, Loader2, Download, Upload, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface ScryfallCard {
  id: string;
  name: string;
  mana_cost: string;
  type_line: string;
  oracle_text?: string;
  image_uris?: { small: string; normal: string; large: string };
  card_faces?: { image_uris?: { small: string; normal: string } }[];
  colors?: string[];
  rarity: string;
  set_name: string;
}

interface DeckCard {
  card: ScryfallCard;
  quantity: number;
}

const COLOR_MAP: Record<string, string> = {
  W: 'bg-yellow-100 text-yellow-800',
  U: 'bg-blue-500 text-white',
  B: 'bg-gray-800 text-white',
  R: 'bg-red-500 text-white',
  G: 'bg-green-600 text-white',
};

const getCardImage = (card: ScryfallCard): string => {
  if (card.image_uris?.small) return card.image_uris.small;
  if (card.card_faces?.[0]?.image_uris?.small) return card.card_faces[0].image_uris.small;
  return '';
};

const getCardImageLarge = (card: ScryfallCard): string => {
  if (card.image_uris?.normal) return card.image_uris.normal;
  if (card.card_faces?.[0]?.image_uris?.normal) return card.card_faces[0].image_uris.normal;
  return '';
};

export default function MagicDeckBuilder() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ScryfallCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [mainDeck, setMainDeck] = useState<DeckCard[]>([]);
  const [sideboard, setSideboard] = useState<DeckCard[]>([]);
  const [selectedCard, setSelectedCard] = useState<ScryfallCard | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const [deckName, setDeckName] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedDecks, setSavedDecks] = useState<any[]>([]);
  const [loadingDecks, setLoadingDecks] = useState(false);

  const searchCards = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&order=name`);
      if (!res.ok) {
        if (res.status === 404) {
          setResults([]);
          toast.info('Nenhuma carta encontrada');
        }
        return;
      }
      const data = await res.json();
      setResults(data.data?.slice(0, 30) || []);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao buscar cartas');
    } finally {
      setSearching(false);
    }
  }, [query]);

  const addToDeck = (card: ScryfallCard, target: 'main' | 'side') => {
    const setter = target === 'main' ? setMainDeck : setSideboard;
    setter(prev => {
      const existing = prev.find(c => c.card.id === card.id);
      if (existing) {
        if (existing.quantity >= 4 && !card.type_line.includes('Basic Land')) {
          toast.error('Máximo de 4 cópias (exceto terrenos básicos)');
          return prev;
        }
        return prev.map(c => c.card.id === card.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { card, quantity: 1 }];
    });
  };

  const removeFromDeck = (cardId: string, target: 'main' | 'side') => {
    const setter = target === 'main' ? setMainDeck : setSideboard;
    setter(prev => {
      const existing = prev.find(c => c.card.id === cardId);
      if (existing && existing.quantity > 1) {
        return prev.map(c => c.card.id === cardId ? { ...c, quantity: c.quantity - 1 } : c);
      }
      return prev.filter(c => c.card.id !== cardId);
    });
  };

  const totalMain = mainDeck.reduce((s, c) => s + c.quantity, 0);
  const totalSide = sideboard.reduce((s, c) => s + c.quantity, 0);

  const handleSave = async () => {
    if (!deckName.trim()) {
      toast.error('Digite um nome para o deck');
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error('Faça login para salvar');
      setSaving(false);
      return;
    }

    const deckData = {
      user_id: user.id,
      name: deckName,
      main_deck: mainDeck.map(c => ({
        id: c.card.id,
        name: c.card.name,
        quantity: c.quantity,
        image: getCardImage(c.card),
        image_uris: c.card.image_uris || null,
        card_faces: c.card.card_faces || null,
        type_line: c.card.type_line || '',
        mana_cost: c.card.mana_cost || '',
        oracle_text: c.card.oracle_text || '',
      })),
      side_deck: sideboard.map(c => ({
        id: c.card.id,
        name: c.card.name,
        quantity: c.quantity,
        image: getCardImage(c.card),
        image_uris: c.card.image_uris || null,
        card_faces: c.card.card_faces || null,
        type_line: c.card.type_line || '',
        mana_cost: c.card.mana_cost || '',
      })),
      extra_deck: [],
      tokens_deck: [],
      tcg_type: 'magic'
    };

    const { error } = await supabase.from('saved_decks').insert(deckData);
    setSaving(false);
    if (error) {
      toast.error('Erro ao salvar deck');
    } else {
      toast.success('Deck salvo!');
      setSaveOpen(false);
    }
  };

  const loadSavedDecks = async () => {
    setLoadingDecks(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error('Faça login'); setLoadingDecks(false); return; }
    const { data, error } = await supabase
      .from('saved_decks')
      .select('*')
      .eq('user_id', user.id)
      .eq('tcg_type', 'magic')
      .order('created_at', { ascending: false });
    setLoadingDecks(false);
    if (error) { toast.error('Erro ao carregar decks'); return; }
    setSavedDecks(data || []);
    setLoadOpen(true);
  };

  const loadDeck = (deck: any) => {
    const mainCards: DeckCard[] = (deck.main_deck as any[] || []).map((c: any) => ({
      card: {
        id: c.id,
        name: c.name,
        mana_cost: c.mana_cost || '',
        type_line: c.type_line || '',
        oracle_text: c.oracle_text || '',
        image_uris: c.image_uris || (c.image ? { small: c.image, normal: c.image, large: c.image } : undefined),
        card_faces: c.card_faces || undefined,
        colors: c.colors || [],
        rarity: c.rarity || 'common',
        set_name: c.set_name || '',
      } as ScryfallCard,
      quantity: c.quantity || 1,
    }));
    const sideCards: DeckCard[] = (deck.side_deck as any[] || []).map((c: any) => ({
      card: {
        id: c.id,
        name: c.name,
        mana_cost: c.mana_cost || '',
        type_line: c.type_line || '',
        oracle_text: c.oracle_text || '',
        image_uris: c.image_uris || (c.image ? { small: c.image, normal: c.image, large: c.image } : undefined),
        card_faces: c.card_faces || undefined,
        colors: c.colors || [],
        rarity: c.rarity || 'common',
        set_name: c.set_name || '',
      } as ScryfallCard,
      quantity: c.quantity || 1,
    }));
    setMainDeck(mainCards);
    setSideboard(sideCards);
    setDeckName(deck.name);
    setLoadOpen(false);
    toast.success(`Deck "${deck.name}" carregado!`);
  };

  const deleteSavedDeck = async (deckId: string) => {
    const { error } = await supabase.from('saved_decks').delete().eq('id', deckId);
    if (error) { toast.error('Erro ao deletar'); return; }
    setSavedDecks(prev => prev.filter(d => d.id !== deckId));
    toast.success('Deck deletado');
  };

  const exportDeck = () => {
    if (mainDeck.length === 0 && sideboard.length === 0) {
      toast.error('Deck vazio');
      return;
    }
    let text = '// Main Deck\n';
    mainDeck.forEach(c => { text += `${c.quantity} ${c.card.name}\n`; });
    if (sideboard.length > 0) {
      text += '\n// Sideboard\n';
      sideboard.forEach(c => { text += `${c.quantity} ${c.card.name}\n`; });
    }
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deckName || 'mtg-deck'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Deck exportado!');
  };

  const importDeck = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const lines = text.split('\n').filter(l => l.trim() && !l.startsWith('//'));
      let target: 'main' | 'side' = 'main';
      const newMain: DeckCard[] = [];
      const newSide: DeckCard[] = [];

      for (const line of lines) {
        if (line.toLowerCase().includes('sideboard')) { target = 'side'; continue; }
        const match = line.match(/^(\d+)\s+(.+)$/);
        if (!match) continue;
        const qty = parseInt(match[1]);
        const name = match[2].trim();
        try {
          const res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`);
          if (!res.ok) continue;
          const card: ScryfallCard = await res.json();
          const arr = target === 'main' ? newMain : newSide;
          arr.push({ card, quantity: qty });
        } catch { /* skip */ }
      }
      setMainDeck(newMain);
      setSideboard(newSide);
      toast.success('Deck importado!');
    };
    input.click();
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-20 pb-8">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <h1 className="text-2xl font-bold text-gradient-gold flex items-center gap-2">
            ✨ MTG Deck Builder
          </h1>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={exportDeck} className="gap-1">
              <Download className="w-4 h-4" /> Exportar
            </Button>
            <Button variant="outline" size="sm" onClick={importDeck} className="gap-1">
              <Upload className="w-4 h-4" /> Importar
            </Button>
            <Button variant="outline" size="sm" onClick={loadSavedDecks} className="gap-1">
              <FolderOpen className="w-4 h-4" /> Carregar
            </Button>
            <Button size="sm" onClick={() => setSaveOpen(true)} className="gap-1">
              <Save className="w-4 h-4" /> Salvar
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Search Panel */}
          <Card className="card-mystic lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Buscar Cartas</CardTitle>
              <form onSubmit={e => { e.preventDefault(); searchCards(); }} className="flex gap-2">
                <Input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Nome da carta..."
                  className="flex-1"
                />
                <Button type="submit" size="icon" disabled={searching}>
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </Button>
              </form>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[60vh]">
                <div className="space-y-2">
                  {results.map(card => (
                    <div
                      key={card.id}
                      className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer group"
                      onClick={() => setSelectedCard(card)}
                    >
                      {getCardImage(card) && (
                        <img src={getCardImage(card)} alt={card.name} className="w-10 h-14 rounded object-cover" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{card.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{card.type_line}</p>
                        <div className="flex gap-1 mt-1">
                          {card.colors?.map(c => (
                            <span key={c} className={`w-4 h-4 rounded-full text-[10px] flex items-center justify-center ${COLOR_MAP[c] || 'bg-muted'}`}>
                              {c}
                            </span>
                          ))}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="opacity-0 group-hover:opacity-100"
                        onClick={e => { e.stopPropagation(); addToDeck(card, 'main'); }}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Deck Panel */}
          <Card className="card-mystic lg:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">
                  Deck Principal ({totalMain}/100)
                </CardTitle>
                <Badge variant={totalMain >= 100 ? "default" : "secondary"}>
                  {totalMain >= 100 ? '✓ Válido' : `Faltam ${100 - totalMain}`}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[40vh] mb-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {mainDeck.map(({ card, quantity }) => (
                    <div key={card.id} className="relative group">
                      {getCardImage(card) && (
                        <img
                          src={getCardImage(card)}
                          alt={card.name}
                          className="w-full rounded cursor-pointer hover:scale-105 transition-transform"
                          onClick={() => setSelectedCard(card)}
                        />
                      )}
                      <Badge className="absolute top-1 right-1 text-xs">{quantity}x</Badge>
                      <div className="absolute bottom-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="icon" variant="secondary" className="h-6 w-6" onClick={() => addToDeck(card, 'main')}>
                          <Plus className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="destructive" className="h-6 w-6" onClick={() => removeFromDeck(card.id, 'main')}>
                          <Minus className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="border-t border-border pt-4">
                <h3 className="font-medium mb-2">Sideboard ({totalSide}/15)</h3>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {sideboard.map(({ card, quantity }) => (
                    <div key={card.id} className="relative group">
                      {getCardImage(card) && (
                        <img
                          src={getCardImage(card)}
                          alt={card.name}
                          className="w-full rounded cursor-pointer"
                          onClick={() => setSelectedCard(card)}
                        />
                      )}
                      <Badge className="absolute top-1 right-1 text-xs">{quantity}x</Badge>
                      <div className="absolute bottom-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100">
                        <Button size="icon" variant="destructive" className="h-5 w-5" onClick={() => removeFromDeck(card.id, 'side')}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Card Detail Modal */}
        {selectedCard && (
          <Dialog open={!!selectedCard} onOpenChange={() => setSelectedCard(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{selectedCard.name}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col items-center gap-4">
                {getCardImageLarge(selectedCard) && (
                  <img src={getCardImageLarge(selectedCard)} alt={selectedCard.name} className="w-64 rounded-lg" />
                )}
                <div className="w-full space-y-2 text-sm">
                  <p><strong>Tipo:</strong> {selectedCard.type_line}</p>
                  <p><strong>Mana:</strong> {selectedCard.mana_cost}</p>
                  <p><strong>Raridade:</strong> {selectedCard.rarity}</p>
                  <p><strong>Set:</strong> {selectedCard.set_name}</p>
                  {selectedCard.oracle_text && <p className="text-muted-foreground">{selectedCard.oracle_text}</p>}
                </div>
                <div className="flex gap-2 w-full">
                  <Button className="flex-1" onClick={() => { addToDeck(selectedCard, 'main'); setSelectedCard(null); }}>
                    <Plus className="w-4 h-4 mr-1" /> Main Deck
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={() => { addToDeck(selectedCard, 'side'); setSelectedCard(null); }}>
                    <Plus className="w-4 h-4 mr-1" /> Sideboard
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Save Dialog */}
        <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Salvar Deck MTG</DialogTitle>
            </DialogHeader>
            <Input value={deckName} onChange={e => setDeckName(e.target.value)} placeholder="Nome do deck" />
            <DialogFooter>
              <Button variant="outline" onClick={() => setSaveOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Load Dialog */}
        <Dialog open={loadOpen} onOpenChange={setLoadOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Carregar Deck Salvo</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh]">
              {loadingDecks ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
              ) : savedDecks.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhum deck MTG salvo</p>
              ) : (
                <div className="space-y-2">
                  {savedDecks.map(deck => {
                    const mainCount = (deck.main_deck as any[] || []).reduce((s: number, c: any) => s + (c.quantity || 1), 0);
                    const sideCount = (deck.side_deck as any[] || []).reduce((s: number, c: any) => s + (c.quantity || 1), 0);
                    return (
                      <div key={deck.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50">
                        <div>
                          <p className="font-medium text-sm">{deck.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Main: {mainCount} | Side: {sideCount} • {new Date(deck.created_at).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" onClick={() => loadDeck(deck)}>Carregar</Button>
                          <Button size="sm" variant="destructive" onClick={() => deleteSavedDeck(deck.id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
