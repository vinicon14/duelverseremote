import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const CreateTournament = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tournamentName, setTournamentName] = useState("");
  const [tournamentDescription, setTournamentDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [maxParticipants, setMaxParticipants] = useState(8);
  const [prize, setPrize] = useState("");
  const [entryFee, setEntryFee] = useState(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      toast({
        title: "Erro",
        description: "Você precisa estar logado para criar um torneio.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("create-tournament-with-prize", {
        body: {
          name: tournamentName,
          description: tournamentDescription,
          start_date: startDate,
          end_date: endDate,
          max_participants: maxParticipants,
          prize_pool: parseInt(prize, 10),
          entry_fee: entryFee,
        },
      });

      if (error) throw new Error(error.message);

      toast({
        title: "Torneio criado!",
        description: "Seu torneio foi criado com sucesso.",
      });
      navigate("/tournaments");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Ocorreu um erro desconhecido";
      toast({
        title: "Erro ao criar torneio",
        description: message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-20 sm:pt-24 pb-12">
        <Card className="card-mystic max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-gradient-mystic">Criar Novo Torneio</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="tournamentName" className="block text-sm font-medium text-muted-foreground mb-2">
                  Nome do Torneio
                </label>
                <Input
                  id="tournamentName"
                  value={tournamentName}
                  onChange={(e) => setTournamentName(e.target.value)}
                  placeholder="Ex: Torneio Semanal de Yu-Gi-Oh!"
                  required
                />
              </div>
              <div>
                <label htmlFor="tournamentDescription" className="block text-sm font-medium text-muted-foreground mb-2">
                  Descrição
                </label>
                <Textarea
                  id="tournamentDescription"
                  value={tournamentDescription}
                  onChange={(e) => setTournamentDescription(e.target.value)}
                  placeholder="Descreva as regras, formato e outras informações importantes."
                  required
                />
              </div>
              <div>
                <label htmlFor="startDate" className="block text-sm font-medium text-muted-foreground mb-2">
                  Data de Início
                </label>
                <Input
                  id="startDate"
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
                </div>
                <div>
                  <label htmlFor="endDate" className="block text-sm font-medium text-muted-foreground mb-2">
                    Data de Fim
                  </label>
                  <Input
                    id="endDate"
                    type="datetime-local"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                  />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="maxParticipants" className="block text-sm font-medium text-muted-foreground mb-2">
                    Máximo de Participantes
                  </label>
                  <Input
                    id="maxParticipants"
                    type="number"
                    value={maxParticipants}
                    onChange={(e) => setMaxParticipants(parseInt(e.target.value, 10))}
                    min="8"
                    step="1"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="prize" className="block text-sm font-medium text-muted-foreground mb-2">
                    Premiação
                  </label>
                  <Input
                    id="prize"
                    value={prize}
                    onChange={(e) => setPrize(e.target.value)}
                    placeholder="Ex: 100 DuelCoins"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="entryFee" className="block text-sm font-medium text-muted-foreground mb-2">
                  Taxa de Inscrição
                </label>
                <Input
                  id="entryFee"
                  type="number"
                  value={entryFee}
                  onChange={(e) => setEntryFee(parseInt(e.target.value, 10))}
                  placeholder="Ex: 10 DuelCoins"
                />
              </div>
              <div className="flex justify-end gap-4">
                <Button type="button" variant="outline" onClick={() => navigate('/tournaments')}>
                  Cancelar
                </Button>
                <Button type="submit" className="btn-mystic text-white">
                  Criar Torneio
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default CreateTournament;
