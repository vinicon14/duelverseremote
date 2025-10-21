import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface TransferDuelCoinsModalProps {
  isOpen: boolean;
  onClose: () => void;
  friend: any;
  currentUserBalance: number;
  onTransferSuccess: () => void;
}

export const TransferDuelCoinsModal = ({
  isOpen,
  onClose,
  friend,
  currentUserBalance,
  onTransferSuccess,
}: TransferDuelCoinsModalProps) => {
  const { toast } = useToast();
  const [amount, setAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleTransfer = async () => {
    setIsLoading(true);
    const transferAmount = parseInt(amount, 10);

    if (isNaN(transferAmount) || transferAmount <= 0) {
      toast({
        title: "Valor inválido",
        description: "Por favor, insira um número positivo.",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    if (transferAmount > currentUserBalance) {
      toast({
        title: "Saldo insuficiente",
        description: "Você não tem DuelCoins suficientes para esta transferência.",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Usuário não autenticado.");
      }

      const { error } = await supabase.rpc('transfer_duelcoins', {
        sender_id_param: session.user.id,
        receiver_username_param: friend.username,
        amount_param: transferAmount,
      });

      if (error) {
        throw error;
      }

      onTransferSuccess();
    } catch (error: any) {
      toast({
        title: "Erro na transferência",
        description: error.message || "Ocorreu um erro ao tentar transferir.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Enviar DuelCoins para @{friend?.username}</DialogTitle>
          <DialogDescription>
            Saldo atual: {currentUserBalance} DuelCoins
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Input
            id="amount"
            type="number"
            placeholder="Quantidade a transferir"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="col-span-3"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleTransfer} disabled={isLoading}>
            {isLoading ? "Enviando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
