/**
 * DuelVerse - Equipar Playmat/Sleeve dentro do simulador
 * Permite trocar o playmat e as sleeves sem sair da Arena.
 */
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useArenaEquipment } from '@/hooks/useArenaEquipment';
import { Loader2, Palette, Check } from 'lucide-react';

interface EquipItem {
  id: string;
  name: string;
  image_url: string | null;
  kind: 'playmat' | 'sleeve';
}

interface ArenaEquipmentButtonProps {
  className?: string;
  compact?: boolean;
}

const detectKind = (name: string, metadata: unknown): 'playmat' | 'sleeve' | null => {
  const meta = (metadata || {}) as Record<string, unknown>;
  const type = typeof meta.type === 'string' ? meta.type : '';
  if (type === 'playmat') return 'playmat';
  if (type === 'sleeve') return 'sleeve';
  const lower = (name || '').toLowerCase();
  if (lower.includes('playmat') || lower.includes('tapete')) return 'playmat';
  if (lower.includes('sleeve') || lower.includes('manga')) return 'sleeve';
  return null;
};

export const ArenaEquipmentButton = ({ className, compact = false }: ArenaEquipmentButtonProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<EquipItem[]>([]);
  const { playmatId, sleeveId, setEquipment } = useArenaEquipment();
  const { toast } = useToast();

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setItems([]);
        return;
      }
      const { data, error } = await supabase
        .from('user_inventory')
        .select('id, product:marketplace_products(id, name, image_url, metadata)')
        .eq('user_id', session.user.id);

      if (error) throw error;

      const mapped: EquipItem[] = [];
      (data || []).forEach((row: any) => {
        const product = row.product;
        if (!product?.image_url) return;
        const kind = detectKind(product.name, product.metadata);
        if (!kind) return;
        mapped.push({ id: row.id, name: product.name, image_url: product.image_url, kind });
      });
      setItems(mapped);
    } catch (err) {
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar seus itens.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (open) fetchItems();
  }, [open, fetchItems]);

  const handleEquip = (item: EquipItem) => {
    const equippedId = item.kind === 'playmat' ? playmatId : sleeveId;
    if (equippedId === item.id) {
      setEquipment(item.kind, null);
      toast({ title: item.kind === 'playmat' ? 'Playmat removido' : 'Sleeve removida' });
    } else {
      setEquipment(item.kind, { id: item.id, url: item.image_url! });
      toast({
        title: item.kind === 'playmat' ? 'Playmat equipado! 🎨' : 'Sleeve equipada! 🃏',
        description: item.name,
      });
    }
  };

  const renderGrid = (kind: 'playmat' | 'sleeve') => {
    const list = items.filter((i) => i.kind === kind);
    const equippedId = kind === 'playmat' ? playmatId : sleeveId;

    if (loading) {
      return (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (list.length === 0) {
      return (
        <p className="text-xs text-muted-foreground text-center py-10">
          Você ainda não possui {kind === 'playmat' ? 'playmats' : 'sleeves'}. Compre na loja de itens.
        </p>
      );
    }

    return (
      <ScrollArea className="h-[260px] pr-2">
        <div className="grid grid-cols-3 gap-2">
          {list.map((item) => {
            const isEquipped = equippedId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleEquip(item)}
                className={cn(
                  'relative rounded-md overflow-hidden border-2 transition-all hover:scale-[1.02]',
                  isEquipped ? 'border-primary' : 'border-border/50'
                )}
                title={item.name}
              >
                <img
                  src={item.image_url!}
                  alt={item.name}
                  className={cn('w-full object-cover', kind === 'playmat' ? 'h-16' : 'h-24')}
                  loading="lazy"
                />
                {isEquipped && (
                  <Badge className="absolute top-1 right-1 h-5 px-1 gap-0.5 text-[9px]">
                    <Check className="h-2.5 w-2.5" /> Equipado
                  </Badge>
                )}
                <span className="block text-[9px] truncate px-1 py-0.5 bg-background/80">
                  {item.name}
                </span>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(compact ? 'h-6 w-6' : 'h-7 w-7', className)}
          title="Equipar playmat / sleeve"
        >
          <Palette className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md z-[100]">
        <DialogHeader>
          <DialogTitle className="text-base">Equipamentos da Arena</DialogTitle>
          <DialogDescription className="text-xs">
            Toque em um item para equipar ou desequipar. A mudança é aplicada na hora.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="playmat">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="playmat" className="text-xs">Playmats</TabsTrigger>
            <TabsTrigger value="sleeve" className="text-xs">Sleeves</TabsTrigger>
          </TabsList>
          <TabsContent value="playmat" className="mt-3">{renderGrid('playmat')}</TabsContent>
          <TabsContent value="sleeve" className="mt-3">{renderGrid('sleeve')}</TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
