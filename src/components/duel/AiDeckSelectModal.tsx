import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Search, Shuffle, Upload, Bot } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import type { AiDeckCard } from '@/hooks/useAiDuel';

interface AiDeckSelectModalProps {
  open: boolean;
  onClose: () => void;
  onSelectDeck: (cards: AiDeckCard[]) => void;
}

// Sample archetype decks for random selection
const SAMPLE_DECKS = [
  'Blue-Eyes', 'Dark Magician', 'Red-Eyes', 'Elemental HERO',
  'Stardust Dragon', 'Utopia', 'Cyber Dragon', 'Ancient Gear',
  'Lightsworn', 'Blackwing', 'Six Samurai', 'Gladiator Beast',
];

export const AiDeckSelectModal = ({ open, onClose, onSelectDeck }: AiDeckSelectModalProps) => {
  const { toast } = useToast();
  const [deckName, setDeckName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [decklistText, setDecklistText] = useState('');

  const searchDeckByName = async (name: string) => {
    setIsLoading(true);
    try {
      // Search YGOPRODeck API for cards matching the archetype
      const response = await fetch(
        `https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(name)}&num=40&offset=0`
      );
      
      if (!response.ok) throw new Error('Deck não encontrado');
      
      const data = await response.json();
      const cards: AiDeckCard[] = (data.data || []).slice(0, 40).map((c: any) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        desc: c.desc,
        atk: c.atk,
        def: c.def,
        level: c.level,
        race: c.race,
        attribute: c.attribute,
        card_images: c.card_images,
      }));

      if (cards.length < 20) {
        toast({ title: "Poucas cartas encontradas", description: `Apenas ${cards.length} cartas. Tente outro nome.`, variant: "destructive" });
        return;
      }

      onSelectDeck(cards);
      onClose();
      toast({ title: "Deck carregado!", description: `${cards.length} cartas do arquétipo "${name}"` });
    } catch (err) {
      toast({ title: "Erro", description: "Não foi possível buscar o deck. Tente outro nome.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const loadRandomDeck = async () => {
    const randomArchetype = SAMPLE_DECKS[Math.floor(Math.random() * SAMPLE_DECKS.length)];
    toast({ title: "🎲 Deck aleatório", description: `Buscando: ${randomArchetype}` });
    await searchDeckByName(randomArchetype);
  };

  const importDecklist = () => {
    if (!decklistText.trim()) {
      toast({ title: "Erro", description: "Cole a lista de cartas primeiro.", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    
    // Parse card names from text (one per line, optionally with quantity)
    const lines = decklistText.split('\n').filter(l => l.trim());
    const cardNames: string[] = [];
    
    lines.forEach(line => {
      const match = line.trim().match(/^(\d+)x?\s+(.+)$/i) || [null, '1', line.trim()];
      const qty = parseInt(match[1] || '1');
      const name = (match[2] || line).trim();
      if (name && !name.startsWith('#') && !name.startsWith('//')) {
        for (let i = 0; i < Math.min(qty, 3); i++) {
          cardNames.push(name);
        }
      }
    });

    // Fetch each unique card
    const uniqueNames = [...new Set(cardNames)];
    
    Promise.all(
      uniqueNames.map(name =>
        fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${encodeURIComponent(name)}`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      )
    ).then(results => {
      const cardMap = new Map<string, any>();
      results.forEach((r, i) => {
        if (r?.data?.[0]) {
          cardMap.set(uniqueNames[i], r.data[0]);
        }
      });

      const deck: AiDeckCard[] = cardNames
        .map(name => {
          const c = cardMap.get(name);
          if (!c) return null;
          return {
            id: c.id,
            name: c.name,
            type: c.type,
            desc: c.desc,
            atk: c.atk,
            def: c.def,
            level: c.level,
            race: c.race,
            attribute: c.attribute,
            card_images: c.card_images,
          };
        })
        .filter(Boolean) as AiDeckCard[];

      if (deck.length < 10) {
        toast({ title: "Erro", description: `Apenas ${deck.length} cartas válidas encontradas.`, variant: "destructive" });
        setIsLoading(false);
        return;
      }

      onSelectDeck(deck);
      onClose();
      toast({ title: "Deck importado!", description: `${deck.length} cartas carregadas` });
      setIsLoading(false);
    }).catch(() => {
      toast({ title: "Erro", description: "Falha ao importar deck.", variant: "destructive" });
      setIsLoading(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Escolha o Deck da IA
          </DialogTitle>
          <DialogDescription>
            Selecione como a IA vai montar seu deck para o duelo
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="search" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="search" className="text-xs">
              <Search className="h-3 w-3 mr-1" />
              Buscar
            </TabsTrigger>
            <TabsTrigger value="import" className="text-xs">
              <Upload className="h-3 w-3 mr-1" />
              Importar
            </TabsTrigger>
            <TabsTrigger value="random" className="text-xs">
              <Shuffle className="h-3 w-3 mr-1" />
              Aleatório
            </TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="space-y-3 mt-3">
            <p className="text-sm text-muted-foreground">
              Digite o nome de um arquétipo (ex: Blue-Eyes, HERO, Stardust)
            </p>
            <div className="flex gap-2">
              <Input
                value={deckName}
                onChange={(e) => setDeckName(e.target.value)}
                placeholder="Nome do arquétipo..."
                onKeyDown={(e) => e.key === 'Enter' && deckName && searchDeckByName(deckName)}
              />
              <Button
                onClick={() => searchDeckByName(deckName)}
                disabled={!deckName || isLoading}
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="import" className="space-y-3 mt-3">
            <p className="text-sm text-muted-foreground">
              Cole a lista de cartas (uma por linha, formato: "3x Nome da Carta")
            </p>
            <textarea
              value={decklistText}
              onChange={(e) => setDecklistText(e.target.value)}
              placeholder={"3x Blue-Eyes White Dragon\n2x Trade-In\n1x Monster Reborn\n..."}
              className="w-full h-32 p-2 text-sm border border-border rounded-md bg-background resize-none"
            />
            <Button onClick={importDecklist} disabled={isLoading} className="w-full">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
              Importar Deck
            </Button>
          </TabsContent>

          <TabsContent value="random" className="space-y-3 mt-3">
            <p className="text-sm text-muted-foreground">
              A IA vai usar um deck aleatório de arquétipos clássicos
            </p>
            <div className="flex flex-wrap gap-1">
              {SAMPLE_DECKS.map(name => (
                <Button
                  key={name}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => searchDeckByName(name)}
                  disabled={isLoading}
                >
                  {name}
                </Button>
              ))}
            </div>
            <Button onClick={loadRandomDeck} disabled={isLoading} className="w-full" variant="secondary">
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Shuffle className="h-4 w-4 mr-2" />}
              Deck Aleatório
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};