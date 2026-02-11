import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Navbar } from "@/components/Navbar";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

// Swiss tournament rounds calculation
const getSwissRounds = (playerCount: number): number => {
  if (playerCount >= 65) return 7;
  if (playerCount >= 33) return 6;
  if (playerCount >= 17) return 5;
  if (playerCount >= 9) return 4;
  return 3; // 5-8 players
};

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
  const [tournamentType, setTournamentType] = useState<'single_elimination' | 'swiss'>('single_elimination');
  const [loading, setLoading] = useState(false);

  const swissRounds = getSwissRounds(maxParticipants);

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
      // Use RPC function to handle prize pool deduction atomically
      const { data, error } = await (supabase as any).rpc("create_normal_tournament", {
        p_name: name,
        p_description: description,
        p_start_date: startDate,
        p_end_date: endDate,
        p_prize_pool: prizePool,
        p_entry_fee: entryFee,
        p_max_participants: maxParticipants,
        p_tournament_type: tournamentType,
      });

      if (error) throw error;
      
      if (!data?.success) {
        throw new Error(data?.message || "Erro ao criar torneio");
      }

      toast({
        title: "Torneio criado com sucesso!",
        description: tournamentType === 'swiss' 
          ? `Torneio Suíço com ${swissRounds} rodadas + Top 4 eliminatório.\nPrêmio de ${prizePool} DC foi deduzido do seu saldo.`
          : `O novo torneio já está visível para os jogadores.\nPrêmio de ${prizePool} DC foi deduzido do seu saldo.`,
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
              
              {/* Tournament Type */}
              <div>
                <Label htmlFor="tournamentType">Tipo de Torneio</Label>
                <Select value={tournamentType} onValueChange={(v) => setTournamentType(v as any)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single_elimination">Eliminação Simples</SelectItem>
                    <SelectItem value="swiss">Suíço + Top 4</SelectItem>
                  </SelectContent>
                </Select>
                {tournamentType === 'swiss' && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {swissRounds} rodadas suíças → Top 4 eliminatório
                  </p>
                )}
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
