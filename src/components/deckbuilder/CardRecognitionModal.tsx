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
  onAddCards: (cards: YugiohCard[], deckType?: 'main' | 'extra' | 'side') => void;
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const searchCardByName = async (cardName: string): Promise<YugiohCard | null> => {
    try {
      const response = await fetch(
        `https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(cardName)}`
      );
      const data = await response.json();
      if (data.data && data.data.length > 0) {
        return data.data[0];
      }
      return null;
    } catch {
      return null;
    }
  };

  const EXTRA_DECK_TYPES = ['Fusion', 'Synchro', 'XYZ', 'Link'];

  const isExtraDeckCard = (card: YugiohCard): boolean => {
    return EXTRA_DECK_TYPES.some((type) => card.type.includes(type));
  };

  const parseCardLine = (line: string): { name: string; deckType: 'main' | 'extra' | 'side' | 'auto' } => {
    const lowerLine = line.toLowerCase();
    
    if (lowerLine.startsWith('side:') || lowerLine.startsWith('sd:')) {
      return { name: line.replace(/^(side:|sd:)\s*/i, '').trim(), deckType: 'side' };
    }
    if (lowerLine.startsWith('extra:') || lowerLine.startsWith('ed:')) {
      return { name: line.replace(/^(extra:|ed:)\s*/i, '').trim(), deckType: 'extra' };
    }
    if (lowerLine.startsWith('main:') || lowerLine.startsWith('md:')) {
      return { name: line.replace(/^(main:|md:)\s*/i, '').trim(), deckType: 'main' };
    }
    
    return { name: line.trim(), deckType: 'auto' };
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
      const parsedCards: { name: string; deckType: 'main' | 'extra' | 'side' | 'auto' }[] = [];
      
      for (const line of lines) {
        parsedCards.push(parseCardLine(line));
      }

      const uniqueNames = [...new Set(parsedCards.map(p => p.name))];
      const foundCards: { card: YugiohCard; deckType: 'main' | 'extra' | 'side' }[] = [];
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
          
          foundCards.push({ card, deckType });
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
        foundCards.forEach(({ card, deckType }) => {
          deckTypesMap.set(card.id, deckType);
        });
        setCardDeckTypes(deckTypesMap);
        
        const mainCount = groupedByDeck.main.length;
        const extraCount = groupedByDeck.extra.length;
        const sideCount = groupedByDeck.side.length;
        
        let message = '';
        if (mainCount > 0) message += `${mainCount} main, `;
        if (extraCount > 0) message += `${extraCount} extra, `;
        if (sideCount > 0) message += `${sideCount} side`;
        
        toast.success(`${foundCards.length} carta(s) encontrada(s)! (${message.replace(/, $/, '')})`);
        
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
      
      if (mainCards.length > 0) onAddCards(mainCards, 'main');
      if (extraCards.length > 0) onAddCards(extraCards, 'extra');
      if (sideCards.length > 0) onAddCards(sideCards, 'side');
      
      const totalAdded = mainCards.length + extraCards.length + sideCards.length;
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
      <DialogContent className="sm:max-w-lg max-h-[90vh]">
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
                  placeholder="Cole aqui a lista de cartas (uma por linha):&#10;Dark Magician&#10;Blue-Eyes White Dragon&#10;Ash Blossom & Joyous Spring&#10;Pot of Desires"
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
                  A IA identificará automaticamente o tipo de carta e decidirá se vai para Main Deck, Extra Deck ou Side Deck.
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
                <Badge variant="secondary">{selectedCards.size} selecionadas</Badge>
              </div>
              <ScrollArea className="h-48">
                <div className="grid grid-cols-4 gap-2 pr-4">
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
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Action buttons */}
          {recognizedCards.length > 0 && (
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={handleReset}>
                Nova Análise
              </Button>
              <Button
                onClick={handleAddSelected}
                disabled={selectedCards.size === 0}
              >
                <Plus className="h-4 w-4 mr-2" />
                Adicionar {selectedCards.size} Carta(s)
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};