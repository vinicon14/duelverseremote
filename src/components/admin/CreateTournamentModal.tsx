import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

export const CreateTournamentModal = ({ onTournamentCreated }: { onTournamentCreated: () => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("single_elimination");
  const [entryFee, setEntryFee] = useState(0);
  const [prizePool, setPrizePool] = useState(0);
  const [maxParticipants, setMaxParticipants] = useState(8);
  const [startDate, setStartDate] = useState("");
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!name || !startDate) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }

    const tournamentData = {
        name,
        description,
        type,
        entry_fee: entryFee,
        prize_pool: prizePool,
        max_participants: maxParticipants,
        start_date: new Date(startDate).toISOString(),
        end_date: new Date(new Date(startDate).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(), //End date 7 days after start date
    };

    try {
        const { data, error } = await supabase.functions.invoke('create-tournament', {
            body: { tournamentData },
        });

        if (error) throw error;

        toast({ title: "Torneio criado com sucesso!" });
        onTournamentCreated();
        setIsOpen(false);
    } catch (error: any) {
        toast({ title: "Erro ao criar torneio", description: error.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>Criar Torneio</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar Novo Torneio</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="name">Nome</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="description">Descrição</Label>
            <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="type">Tipo</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single_elimination">Eliminação Simples</SelectItem>
                <SelectItem value="double_elimination">Eliminação Dupla</SelectItem>
                <SelectItem value="swiss">Sistema Suíço</SelectItem>
                <SelectItem value="duelcoins_entry">Apostado (DuelCoins)</SelectItem>
                <SelectItem value="free_entry">Aberto (Grátis)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="entryFee">Taxa de Inscrição</Label>
            <Input id="entryFee" type="number" value={entryFee} onChange={(e) => setEntryFee(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="prizePool">Prêmio</Label>
            <Input id="prizePool" type="number" value={prizePool} onChange={(e) => setPrizePool(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="maxParticipants">Máx. de Participantes</Label>
            <Input id="maxParticipants" type="number" value={maxParticipants} onChange={(e) => setMaxParticipants(Number(e.target.value))} />
          </div>
          <div>
            <Label htmlFor="startDate">Data de Início</Label>
            <Input id="startDate" type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
          <Button onClick={handleSubmit}>Criar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
