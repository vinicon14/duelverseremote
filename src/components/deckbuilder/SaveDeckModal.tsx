import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Save, Loader2 } from 'lucide-react';

interface SaveDeckModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (name: string, description: string, isPublic: boolean) => Promise<void>;
  isLoading: boolean;
  existingName?: string;
  existingDescription?: string;
  existingIsPublic?: boolean;
  isUpdate?: boolean;
}

export const SaveDeckModal = ({
  open,
  onClose,
  onSave,
  isLoading,
  existingName = '',
  existingDescription = '',
  existingIsPublic = false,
  isUpdate = false,
}: SaveDeckModalProps) => {
  const [name, setName] = useState(existingName);
  const [description, setDescription] = useState(existingDescription);
  const [isPublic, setIsPublic] = useState(existingIsPublic);

  const handleSave = async () => {
    if (!name.trim()) return;
    await onSave(name.trim(), description.trim(), isPublic);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isUpdate ? 'Atualizar Deck' : 'Salvar Deck'}</DialogTitle>
          <DialogDescription>
            {isUpdate 
              ? 'Atualize as informações do seu deck'
              : 'Salve seu deck para usar depois'
            }
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="deck-name">Nome do Deck</Label>
            <Input
              id="deck-name"
              placeholder="Ex: Blue-Eyes Chaos MAX"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="deck-description">Descrição (opcional)</Label>
            <Textarea
              id="deck-description"
              placeholder="Descreva sua estratégia..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="deck-public">Deck Público</Label>
              <p className="text-xs text-muted-foreground">
                Outros jogadores podem ver este deck
              </p>
            </div>
            <Switch
              id="deck-public"
              checked={isPublic}
              onCheckedChange={setIsPublic}
            />
          </div>
          
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose} disabled={isLoading}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!name.trim() || isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {isUpdate ? 'Atualizar' : 'Salvar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};