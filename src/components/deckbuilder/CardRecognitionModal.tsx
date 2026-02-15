import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Camera, Upload, Loader2, X, Plus, Wand2, FileText } from 'lucide-react';
import { YugiohCard } from '@/hooks/useYugiohCards';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CardRecognitionModalProps {
  open: boolean;
  onClose: () => void;
  onAddCards: (cards: YugiohCard[], deckType?: 'main' | 'extra' | 'side', quantities?: number[]) => void;
}

export const CardRecognitionModal = ({
  open,
  onClose,
  onAddCards,
}: CardRecognitionModalProps) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [recognizedCards, setRecognizedCards] = useState<YugiohCard[]>([]);
  const [selectedCards, setSelectedCards] = useState<Set<number>>(new Set());
  const [textInput, setTextInput] = useState('');
  const [inputMode, setInputMode] = useState<'image' | 'text'>('image');
  const [cardDeckTypes, setCardDeckTypes] = useState<Map<number, 'main' | 'extra' | 'side'>>(new Map());
  const [cardQuantities, setCardQuantities] = useState<Map<number, number>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const searchCardByName = async (cardName: string): Promise<YugiohCard | null> => {
    for (const lang of ['pt', 'en']) {
      try {
        const response = await fetch(
          `https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(cardName)}&language=${lang}`
        );
        const data = await response.json();
        if (data.data && data.data.length > 0) {
          return data.data[0];
        }
      } catch {
        continue;
      }
    }
    return null;
  };

  const EXTRA_DECK_TYPES = ['Fusion', 'Synchro', 'XYZ', 'Link'];

  const isExtraDeckCard = (card: YugiohCard): boolean => {
    return EXTRA_DECK_TYPES.some((type) => card.type.includes(type));
  };

  const parseCardLine = (line: string): { name: string; deckType: 'main' | 'extra' | 'side' | 'auto'; quantity: number } | null => {
    const trimmedLine = line.trim();
    
    if (!trimmedLine || trimmedLine.startsWith('#') || trimmedLine.startsWith('//') || trimmedLine.startsWith('!')) {
      return null;
    }
    
    const lowerLine = trimmedLine.toLowerCase();
    let deckType: 'main' | 'extra' | 'side' | 'auto' = 'auto';
    let name = trimmedLine;
    
    if (lowerLine.startsWith('side:') || lowerLine.startsWith('sd:')) {
      deckType = 'side';
      name = line.replace(/^(side:|sd:)\s*/i, '').trim();
    } else if (lowerLine.startsWith('extra:') || lowerLine.startsWith('ed:')) {
      deckType = 'extra';
      name = line.replace(/^(extra:|ed:)\s*/i, '').trim();
    } else if (lowerLine.startsWith('main:') || lowerLine.startsWith('md:')) {
      deckType = 'main';
      name = line.replace(/^(main:|md:)\s*/i, '').trim();
    }
    
    const quantityMatch = name.match(/^(\d+)\s+/);
    let quantity = 1;
    if (quantityMatch) {
      quantity = parseInt(quantityMatch[1], 10);
      name = name.replace(/^\d+\s+/, '').trim();
    }
    
    return { name, deckType, quantity };
  };

  const analyzeText = async () => {
    if (!textInput.trim()) {
      toast.error('Por favor, insira os nomes das cartas');
      return;
    }

    setIsAnalyzing(true);
    setRecognizedCards([]);
    setSelectedCards(new Set());

    try {
      const lines = textInput.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      const parsedCards: { name: string; deckType: 'main' | 'extra' | 'side' | 'auto'; quantity: number }[] = [];
      
      for (const line of lines) {
        const parsed = parseCardLine(line);
        if (parsed) {
          parsedCards.push(parsed);
        }
      }

      if (parsedCards.length === 0) {
        toast.error('Nenhuma carta encontrada no texto');
        setIsAnalyzing(false);
        return;
      }

      const foundCards: { card: YugiohCard; deckType: 'main' | 'extra' | 'side'; quantity: number }[] = [];
      const notFound: string[] = [];

      for (const parsed of parsedCards) {
        const card = await searchCardByName(parsed.name);
        if (card) {
          let deckType: 'main' | 'extra' | 'side';
          
          if (parsed.deckType === 'auto') {
            deckType = isExtraDeckCard(card) ? 'extra' : 'main';
          } else {
            deckType = parsed.deckType;
          }
          
          foundCards.push({ card, deckType, quantity: Math.min(parsed.quantity, 3) });
        } else {
          notFound.push(parsed.name);
        }
      }

      if (foundCards.length > 0) {
        const groupedByDeck = {
          main: foundCards.filter(c => c.deckType === 'main').map(c => c.card),
          extra: foundCards.filter(c => c.deckType === 'extra').map(c => c.card),
          side: foundCards.filter(c => c.deckType === 'side').map(c => c.card),
        };
        
        setRecognizedCards(foundCards.map(c => c.card));
        setSelectedCards(new Set(foundCards.map(c => c.card.id)));
        
        const deckTypesMap = new Map<number, 'main' | 'extra' | 'side'>();
        const quantitiesMap = new Map<number, number>();
        
        foundCards.forEach(({ card, deckType, quantity }) => {
          deckTypesMap.set(card.id, deckType);
          quantitiesMap.set(card.id, quantity);
        });
        setCardDeckTypes(deckTypesMap);
        setCardQuantities(quantitiesMap);
        
        const mainCount = groupedByDeck.main.length;
        const extraCount = groupedByDeck.extra.length;
        const sideCount = groupedByDeck.side.length;
        
        let message = '';
        if (mainCount > 0) message += `${mainCount} main, `;
        if (extraCount > 0) message += `${extraCount} extra, `;
        if (sideCount > 0) message += `${sideCount} side`;
        
        const totalCards = foundCards.reduce((acc, c) => acc + c.quantity, 0);
        toast.success(`${totalCards} carta(s) encontrada(s)! (${message.replace(/, $/, '')})`);
        
        if (notFound.length > 0) {
          toast.info(`${notFound.length} carta(s) não encontrada(s): ${notFound.slice(0, 3).join(', ')}${notFound.length > 3 ? '...' : ''}`);
        }
      } else {
        toast.error('Nenhuma carta foi encontrada. Verifique os nomes.');
      }
    } catch (error) {
      console.error('Error analyzing text:', error);
      toast.error('Erro ao processar o texto');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Convert to base64
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      setImagePreview(base64);
      await analyzeImage(base64);
    };
    reader.readAsDataURL(file);
  };

  const analyzeImage = async (imageBase64: string) => {
    setIsAnalyzing(true);
    setRecognizedCards([]);
    setSelectedCards(new Set());

    try {
      const { data, error } = await supabase.functions.invoke('recognize-cards', {
        body: { imageBase64 },
      });

      if (error) {
        if (error.message?.includes('429')) {
          toast.error('Limite de requisições atingido. Tente novamente em alguns segundos.');
        } else if (error.message?.includes('402')) {
          toast.error('Créditos insuficientes. Adicione créditos à sua conta.');
        } else {
          throw error;
        }
        return;
      }

      if (data.cards && data.cards.length > 0) {
        setRecognizedCards(data.cards);
        // Select all by default
        setSelectedCards(new Set(data.cards.map((c: YugiohCard) => c.id)));
        toast.success(`${data.cards.length} carta(s) reconhecida(s)!`);
      } else {
        toast.info('Nenhuma carta foi reconhecida na imagem. Tente uma foto mais clara.');
      }
    } catch (error: any) {
      console.error('Error analyzing image:', error);
      toast.error('Erro ao analisar a imagem');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleCardSelection = (cardId: number) => {
    const newSelected = new Set(selectedCards);
    if (newSelected.has(cardId)) {
      newSelected.delete(cardId);
    } else {
      newSelected.add(cardId);
    }
    setSelectedCards(newSelected);
  };

  const handleAddSelected = () => {
    const cardsToAdd = recognizedCards.filter(c => selectedCards.has(c.id));
    if (cardsToAdd.length > 0) {
      const mainCards = cardsToAdd.filter(c => cardDeckTypes.get(c.id) === 'main' || (!cardDeckTypes.has(c.id) && !isExtraDeckCard(c)));
      const extraCards = cardsToAdd.filter(c => cardDeckTypes.get(c.id) === 'extra' || (!cardDeckTypes.has(c.id) && isExtraDeckCard(c)));
      const sideCards = cardsToAdd.filter(c => cardDeckTypes.get(c.id) === 'side');
      
      if (mainCards.length > 0) {
        const quantities = mainCards.map(c => cardQuantities.get(c.id) || 1);
        onAddCards(mainCards, 'main', quantities);
      }
      if (extraCards.length > 0) {
        const quantities = extraCards.map(c => cardQuantities.get(c.id) || 1);
        onAddCards(extraCards, 'extra', quantities);
      }
      if (sideCards.length > 0) {
        const quantities = sideCards.map(c => cardQuantities.get(c.id) || 1);
        onAddCards(sideCards, 'side', quantities);
      }
      
      const totalAdded = cardsToAdd.reduce((acc, c) => acc + (cardQuantities.get(c.id) || 1), 0);
      toast.success(`${totalAdded} carta(s) adicionada(s) ao deck!`);
    }
    handleReset();
    onClose();
  };

  const handleReset = () => {
    setImagePreview(null);
    setRecognizedCards([]);
    setSelectedCards(new Set());
    setTextInput('');
    setCardDeckTypes(new Map());
    setCardQuantities(new Map());
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) {
        handleReset();
        onClose();
      }
    }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Reconhecimento de Cartas por IA
          </DialogTitle>
          <DialogDescription>
            Tire uma foto ou envie uma imagem das suas cartas para adicioná-las automaticamente ao deck
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Tabs value={inputMode} onValueChange={(v) => setInputMode(v as 'image' | 'text')} className="w-full">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="image" className="gap-2">
                <Camera className="h-4 w-4" />
                Imagem
              </TabsTrigger>
              <TabsTrigger value="text" className="gap-2">
                <FileText className="h-4 w-4" />
                Texto
              </TabsTrigger>
            </TabsList>

            <TabsContent value="image" className="mt-4">
              {/* Upload buttons */}
              {!imagePreview && (
                <div className="flex gap-2 justify-center">
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 gap-2"
                  >
                    <Upload className="h-4 w-4" />
                    Escolher Imagem
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex-1 gap-2"
                  >
                    <Camera className="h-4 w-4" />
                    Tirar Foto
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>
              )}

              {/* Image preview */}
              {imagePreview && (
                <div className="relative">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="w-full max-h-48 object-contain rounded-lg border"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-6 w-6"
                    onClick={handleReset}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="text" className="mt-4">
              <div className="space-y-3">
                <Textarea
                  placeholder="Cole aqui a lista de cartas (uma por linha):&#10;3 Dark Magician&#10;1 Blue-Eyes White Dragon&#10;side: Maxx C&#10;extra: Knightmare Unicorn"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  className="min-h-[150px] resize-none"
                />
                <div className="flex gap-2">
                  <Button
                    onClick={analyzeText}
                    disabled={isAnalyzing || !textInput.trim()}
                    className="flex-1 gap-2"
                  >
                    {isAnalyzing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Wand2 className="h-4 w-4" />
                    )}
                    Processar Texto
                  </Button>
                  {recognizedCards.length > 0 && (
                    <Button variant="outline" onClick={handleReset}>
                      Limpar
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  A IA identificará automaticamente o tipo de carta e decidirá se vai para Main Deck, Extra Deck ou Side Deck. Use prefixos (main:, extra:, side:) para especificar o deck e números no início para quantidade (ex: 3 Ash Blossom).
                </p>
              </div>
            </TabsContent>
          </Tabs>

          {/* Loading state */}
          {isAnalyzing && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
              <p className="text-sm text-muted-foreground">Analisando imagem com IA...</p>
            </div>
          )}

          {/* Recognized cards */}
          {recognizedCards.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm">Cartas Reconhecidas</h4>
                <div className="flex gap-2">
                  <Badge variant="secondary">{selectedCards.size} selecionadas</Badge>
                  <Badge variant="outline">{recognizedCards.reduce((acc, c) => acc + (cardQuantities.get(c.id) || 1), 0)} cartas</Badge>
                </div>
              </div>
              <ScrollArea className="h-64">
                <div className="grid grid-cols-4 gap-2 pr-4 pb-2">
                  {recognizedCards.map((card) => (
                    <div
                      key={card.id}
                      className={`relative cursor-pointer rounded-lg overflow-hidden transition-all ${
                        selectedCards.has(card.id)
                          ? 'ring-2 ring-primary'
                          : 'opacity-50'
                      }`}
                      onClick={() => toggleCardSelection(card.id)}
                    >
                      <img
                        src={card.card_images[0]?.image_url_small}
                        alt={card.name}
                        className="w-full"
                      />
                      {selectedCards.has(card.id) && (
                        <div className="absolute top-1 right-1 bg-primary rounded-full p-0.5">
                          <Plus className="h-3 w-3 text-primary-foreground" />
                        </div>
                      )}
                      {cardQuantities.get(card.id) && cardQuantities.get(card.id)! > 1 && (
                        <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs font-bold px-1.5 py-0.5 rounded">
                          x{cardQuantities.get(card.id)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Action buttons - always visible when cards are recognized */}
          {recognizedCards.length > 0 && (
            <div className="flex gap-2 justify-between items-center pt-2 border-t">
              <Button variant="outline" onClick={handleReset} size="sm">
                Nova Análise
              </Button>
              <Button
                onClick={handleAddSelected}
                disabled={selectedCards.size === 0}
                className="bg-green-600 hover:bg-green-700"
                size="sm"
              >
                <Plus className="h-4 w-4 mr-1" />
                Adicionar ao Deck
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};