/**
 * DuelVerse - Alterar Apelido
 * Permite ao usuário trocar o nickname por 20 DuelCoins (validado no backend).
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Coins, UserCog } from "lucide-react";

interface Props {
  currentUsername?: string | null;
  onChanged?: (username: string) => void;
}

export function ChangeNicknameDialog({ currentUsername, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const submit = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase.rpc as any)("change_nickname", {
        p_new_username: value.trim(),
      });
      if (error) throw error;
      const result = data as { success?: boolean; message?: string; username?: string } | null;
      if (!result?.success) {
        toast({ title: "Não foi possível alterar", description: result?.message || "Tente novamente", variant: "destructive" });
        return;
      }
      toast({ title: "Apelido alterado!", description: result.message });
      onChanged?.(result.username || value.trim());
      setOpen(false);
      setValue("");
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full sm:w-auto">
          <UserCog className="mr-2 h-4 w-4" />
          Alterar apelido
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar apelido</DialogTitle>
          <DialogDescription className="flex items-center gap-1">
            Custo: <Coins className="w-4 h-4 text-secondary" /> 20 DuelCoins. Apelidos são únicos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="new-nickname">Novo apelido</Label>
          <Input
            id="new-nickname"
            value={value}
            maxLength={20}
            placeholder={currentUsername || "Seu novo apelido"}
            onChange={(e) => setValue(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            3 a 20 caracteres. Letras, números, ponto, hífen ou underline.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={loading}>Cancelar</Button>
          <Button className="btn-mystic text-white" onClick={submit} disabled={loading || value.trim().length < 3}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar (20 DC)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
