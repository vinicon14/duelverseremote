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
import { Trash2, Upload, Loader2, FolderOpen } from 'lucide-react';
import { DeckCard } from '@/components/deckbuilder/DeckPanel';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface SavedDeck {
  id: string;
  name: string;
  description: string | null;
  main_deck: DeckCard[];
  extra_deck: DeckCard[];
  side_deck: DeckCard[];
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

interface LoadDeckModalProps {
  open: boolean;
  onClose: () => void;
  onLoad: (deck: SavedDeck) => void;
  onDelete: (deckId: string) => Promise<boolean>;
  decks: SavedDeck[];
  isLoading: boolean;
  isLoggedIn: boolean;
}

export const LoadDeckModal = ({
  open,
  onClose,
  onLoad,
  onDelete,
  decks,
  isLoading,
  isLoggedIn,
}: LoadDeckModalProps) => {
  const getDeckStats = (deck: SavedDeck) => {
    const mainCount = deck.main_deck.reduce((acc, c) => acc + c.quantity, 0);
    const extraCount = deck.extra_deck.reduce((acc, c) => acc + c.quantity, 0);
    const sideCount = deck.side_deck.reduce((acc, c) => acc + c.quantity, 0);
    return { mainCount, extraCount, sideCount };
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Meus Decks Salvos
          </DialogTitle>
          <DialogDescription>
            Selecione um deck para carregar
          </DialogDescription>
        </DialogHeader>
        
        {!isLoggedIn ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">
              Você precisa estar logado para ver seus decks salvos.
            </p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : decks.length === 0 ? (
          <div className="text-center py-8">
            <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground">
              Você ainda não salvou nenhum deck.
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-2 pr-4">
              {decks.map((deck) => {
                const stats = getDeckStats(deck);
                return (
                  <div
                    key={deck.id}
                    className="p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium truncate">{deck.name}</h4>
                        {deck.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                            {deck.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <Badge variant="secondary" className="text-xs">
                            Main: {stats.mainCount}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            Extra: {stats.extraCount}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            Side: {stats.sideCount}
                          </Badge>
                          {deck.is_public && (
                            <Badge variant="outline" className="text-xs">
                              Público
                            </Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Atualizado {format(new Date(deck.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            onLoad(deck);
                            onClose();
                          }}
                        >
                          <Upload className="h-3 w-3 mr-1" />
                          Carregar
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => onDelete(deck.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
};