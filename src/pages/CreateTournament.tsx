import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Navbar } from "@/components/Navbar";
import { useToast } from "@/hooks/use-toast";

const CreateTournament = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [maxParticipants, setMaxParticipants] = useState(8);
  const [prizePool, setPrizePool] = useState(0);
  const [entryFee, setEntryFee] = useState(0);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({
        title: "Erro de autenticação",
        description: "Você precisa estar logado para criar um torneio.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase.from("tournaments").insert({
        name,
        description,
        start_date: startDate,
        end_date: endDate,
        max_participants: maxParticipants,
        prize_pool: prizePool,
        entry_fee: entryFee,
        created_by: user.id,
        status: 'upcoming'
      });

      if (error) throw error;

      toast({
        title: "Torneio criado com sucesso!",
        description: "O novo torneio já está visível para os jogadores.",
      });
      navigate("/tournaments");
    } catch (error: any) {
      toast({
        title: "Erro ao criar torneio",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-20 sm:pt-24 pb-12">
        <Card className="max-w-2xl mx-auto card-mystic">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-gradient-mystic">Criar Novo Torneio</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium mb-1">Nome do Torneio</label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <label htmlFor="description" className="block text-sm font-medium mb-1">Descrição</label>
                <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} required />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="startDate" className="block text-sm font-medium mb-1">Data de Início</label>
                  <Input id="startDate" type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
                </div>
                <div>
                  <label htmlFor="endDate" className="block text-sm font-medium mb-1">Data de Fim</label>
                  <Input id="endDate" type="datetime-local" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="maxParticipants" className="block text-sm font-medium mb-1">Máx. de Participantes</label>
                  <Input id="maxParticipants" type="number" value={maxParticipants} onChange={(e) => setMaxParticipants(parseInt(e.target.value))} required />
                </div>
                <div>
                  <label htmlFor="prizePool" className="block text-sm font-medium mb-1">Prêmio (DuelCoins)</label>
                  <Input id="prizePool" type="number" value={prizePool} onChange={(e) => setPrizePool(parseInt(e.target.value))} required />
                </div>
                <div>
                  <label htmlFor="entryFee" className="block text-sm font-medium mb-1">Taxa de Inscrição</label>
                  <Input id="entryFee" type="number" value={entryFee} onChange={(e) => setEntryFee(parseInt(e.target.value))} required />
                </div>
              </div>
              <Button type="submit" className="w-full btn-mystic text-white" disabled={loading}>
                {loading ? 'Criando...' : 'Criar Torneio'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default CreateTournament;
