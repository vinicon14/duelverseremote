/**
 * DuelVerse - Genesis Deck Builder
 * 
 * Interface para criar decks de Genesis usando a API YGOPRODeck (formato Genesys).
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
import { Textarea } from '@/components/ui/textarea';
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

interface DeckCard {
  card: YugiohCard;
  quantity: number;
}

// Color map adapted for YGO attributes for visual compatibility
const COLOR_MAP: Record<string, string> = {
  LIGHT: 'bg-yellow-100 text-yellow-800',
  DARK: 'bg-purple-800 text-white',
  FIRE: 'bg-red-500 text-white',
  WATER: 'bg-blue-500 text-white',
  EARTH: 'bg-amber-700 text-white',
  WIND: 'bg-green-500 text-white',
};

const getCardImage = (card: YugiohCard): string => {
  if (card.card_images?.[0]?.image_url_small) return card.card_images[0].image_url_small;
  return '';
};

const getCardImageLarge = (card: YugiohCard): string => {
  if (card.card_images?.[0]?.image_url) return card.card_images[0].image_url;
  return '';
};

export default function MagicDeckBuilder() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YugiohCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [mainDeck, setMainDeck] = useState<DeckCard[]>([]);
  const [sideboard, setSideboard] = useState<DeckCard[]>([]);
  const [selectedCard, setSelectedCard] = useState<YugiohCard | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [deckName, setDeckName] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedDecks, setSavedDecks] = useState<any[]>([]);
  const [loadingDecks, setLoadingDecks] = useState(false);

  const searchCards = useCallback(async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      // Use YGO API with Genesis format instead of Scryfall
      const res = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?format=genesys&fname=${encodeURIComponent(query)}&num=30`);
      if (!res.ok) {
        setResults([]);
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

  const addToDeck = (card: YugiohCard, target: 'main' | 'side') => {
    const setter = target === 'main' ? setMainDeck : setSideboard;
    setter(prev => {
      const existing = prev.find(c => c.card.id === card.id);
      if (existing) {
        if (existing.quantity >= 3) {
          toast.error('Máximo de 3 cópias por carta');
          return prev;
        }
        return prev.map(c => c.card.id === card.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { card, quantity: 1 }];
    });
  };

  const removeFromDeck = (cardId: number, target: 'main' | 'side') => {
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

  const parseDeckList = (text: string): { main: { qty: number; name: string }[]; side: { qty: number; name: string }[] } => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const main: { qty: number; name: string }[] = [];
    const side: { qty: number; name: string }[] = [];
    let target: 'main' | 'side' = 'main';

    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.startsWith('//') || lower.startsWith('#')) continue;
      if (lower === 'sideboard' || lower === 'sideboard:' || lower.includes('sideboard')) {
        target = 'side';
        continue;
      }
      if (lower === 'deck' || lower === 'deck:' || lower === 'main deck' || lower === 'main deck:' || lower === 'companion' || lower === 'commander') continue;
      // Formats: "4 Lightning Bolt", "4x Lightning Bolt", "Lightning Bolt x4"
      let match = line.match(/^(\d+)x?\s+(.+)$/);
      if (!match) match = line.match(/^(.+?)\s+x(\d+)$/);
      if (match) {
        const idx = line.match(/^(\d+)/) ? 1 : 2;
        const nameIdx = idx === 1 ? 2 : 1;
        const qty = parseInt(match[idx]);
        // Strip set/collector info like "(RNA)" or "[RNA:123]"
        const name = match[nameIdx].replace(/\s*[\(\[][A-Z0-9]+[\)\]]\s*/g, '').replace(/\s*\/\/.*$/, '').trim();
        if (name && qty > 0) (target === 'main' ? main : side).push({ qty, name });
      }
    }
    return { main, side };
  };

  const importFromText = async (text: string) => {
    const { main, side } = parseDeckList(text);
    const total = main.length + side.length;
    if (total === 0) {
      toast.error('Nenhuma carta encontrada na lista. Use o formato: "4 Lightning Bolt"');
      return;
    }
    setImporting(true);
    const newMain: DeckCard[] = [];
    const newSide: DeckCard[] = [];
    let loaded = 0;
    let failed = 0;

    const fetchCard = async (name: string): Promise<ScryfallCard | null> => {
      try {
        const res = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`);
        if (!res.ok) return null;
        return await res.json();
      } catch { return null; }
    };

    for (const entry of main) {
      setImportProgress(`Importando ${++loaded}/${total}: ${entry.name}`);
      const card = await fetchCard(entry.name);
      if (card) newMain.push({ card, quantity: entry.qty });
      else failed++;
      await new Promise(r => setTimeout(r, 80)); // Scryfall rate limit
    }
    for (const entry of side) {
      setImportProgress(`Importando ${++loaded}/${total}: ${entry.name}`);
      const card = await fetchCard(entry.name);
      if (card) newSide.push({ card, quantity: entry.qty });
      else failed++;
      await new Promise(r => setTimeout(r, 80));
    }

    setMainDeck(newMain);
    setSideboard(newSide);
    setImporting(false);
    setImportOpen(false);
    setImportText('');
    setImportProgress('');
    toast.success(`Deck importado! ${loaded - failed} cartas carregadas${failed ? `, ${failed} não encontradas` : ''}`);
  };

  const importDeckFromFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,.dec,.dek,.mwDeck';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      await importFromText(text);
    };
    input.click();
  };

  return (
    <div className="min-h-screen bg-transparent">
      <Navbar />
      <main className="container mx-auto px-4 pt-20 pb-8">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <h1 className="text-2xl font-bold text-gradient-gold flex items-center gap-2">
            ✨ Genesis Deck Builder
          </h1>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={exportDeck} className="gap-1">
              <Download className="w-4 h-4" /> {t('common.save', 'Export')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="gap-1">
              <Upload className="w-4 h-4" /> {t('deckBuilder.recognize', 'Import')}
            </Button>
            <Button variant="outline" size="sm" onClick={loadSavedDecks} className="gap-1">
              <FolderOpen className="w-4 h-4" /> {t('deckBuilder.loadDeck')}
            </Button>
            <Button size="sm" onClick={() => setSaveOpen(true)} className="gap-1">
              <Save className="w-4 h-4" /> {t('deckBuilder.saveDeck')}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Search Panel */}
          <Card className="card-mystic lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">{t('deckBuilder.searchCards')}</CardTitle>
              <form onSubmit={e => { e.preventDefault(); searchCards(); }} className="flex gap-2">
                <Input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={t('deckBuilder.searchCards')}
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
                  {t('deckBuilder.mainDeck')} ({totalMain}/100)
                </CardTitle>
                <Badge variant={totalMain >= 100 ? "default" : "secondary"}>
                  {totalMain >= 100 ? '✓' : `-${100 - totalMain}`}
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
              <DialogTitle>{t('deckBuilder.saveDeck')}</DialogTitle>
            </DialogHeader>
            <Input value={deckName} onChange={e => setDeckName(e.target.value)} placeholder={t('deckBuilder.deckName')} />
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
              <DialogTitle>{t('deckBuilder.loadDeck')}</DialogTitle>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh]">
              {loadingDecks ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
              ) : savedDecks.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhum deck Genesis salvo</p>
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
                          <Button size="sm" onClick={() => loadDeck(deck)}>{t('deckBuilder.loadDeck')}</Button>
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

        {/* Import Dialog */}
        <Dialog open={importOpen} onOpenChange={v => { if (!importing) setImportOpen(v); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Importar Lista de Deck</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Cole sua lista no formato: <code className="bg-muted px-1 rounded">4 Lightning Bolt</code>. 
              Suporta formatos MTGA, MTGO e listas comuns. Separe o sideboard com uma linha "Sideboard".
            </p>
            <Textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder={`4 Lightning Bolt\n4 Counterspell\n2 Island\n\nSideboard\n2 Negate`}
              rows={12}
              disabled={importing}
              className="font-mono text-sm"
            />
            {importing && importProgress && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                {importProgress}
              </div>
            )}
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={importDeckFromFile} disabled={importing} className="gap-1">
                <Upload className="w-4 h-4" /> Importar Arquivo .txt
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => { setImportOpen(false); setImportText(''); }} disabled={importing}>
                  Cancelar
                </Button>
                <Button onClick={() => importFromText(importText)} disabled={importing || !importText.trim()}>
                  {importing ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Importando...</> : 'Importar Lista'}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

