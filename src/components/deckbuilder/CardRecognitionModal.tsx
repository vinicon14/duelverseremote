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
import { Camera, Upload, Loader2, X, Plus, Wand2, Link as LinkIcon } from 'lucide-react';
import { YugiohCard } from '@/hooks/useYugiohCards';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CardRecognitionModalProps {
  open: boolean;
  onClose: () => void;
  onAddCards: (cards: YugiohCard[]) => void;
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
  const [neuronLink, setNeuronLink] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

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

  const handleNeuronLink = async () => {
    if (!neuronLink.trim()) {
      toast.error('Cole um link do Neuron');
      return;
    }

    setIsAnalyzing(true);
    setRecognizedCards([]);
    setSelectedCards(new Set());

    try {
      const { data, error } = await supabase.functions.invoke('recognize-neuron', {
        body: { neuronLink: neuronLink.trim() },
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
        setSelectedCards(new Set(data.cards.map((c: YugiohCard) => c.id)));
        toast.success(`${data.cards.length} carta(s) reconhecida(s) do Neuron!`);
      } else {
        toast.info('Nenhuma carta foi reconhecida. Verifique o link.');
      }
    } catch (error: any) {
      console.error('Error fetching Neuron deck:', error);
      toast.error('Erro ao buscar deck do Neuron');
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
      onAddCards(cardsToAdd);
      toast.success(`${cardsToAdd.length} carta(s) adicionada(s) ao deck!`);
    }
    handleReset();
    onClose();
  };

  const handleReset = () => {
    setImagePreview(null);
    setRecognizedCards([]);
    setSelectedCards(new Set());
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