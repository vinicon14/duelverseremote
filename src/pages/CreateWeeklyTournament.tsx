import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Navbar } from "@/components/Navbar";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Coins, Trophy, Users, Calendar, DollarSign, Loader2 } from "lucide-react";
import { DuelCoinsBalance } from "@/components/DuelCoinsBalance";
import { useAccountType } from "@/hooks/useAccountType";

const CreateWeeklyTournament = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isPro, loading: loadingAccountType } = useAccountType();
  const [name, setName] = useState("Torneio Semanal");
  const [description, setDescription] = useState("Participe do Torneio Semanal! Dispute grandes prêmios.");
  const [prizePool, setPrizePool] = useState(100);
  const [entryFee, setEntryFee] = useState(10);
  const [loading, setLoading] = useState(false);
  const [userBalance, setUserBalance] = useState(0);

  useEffect(() => {
    if (!loadingAccountType && !isPro) {
      // Redirect non-Pro users
      navigate("/tournaments", { replace: true });
    }
  }, [isPro, loadingAccountType, navigate]);

  useEffect(() => {
    fetchUserBalance();
  }, []);

  const fetchUserBalance = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("profiles")
        .select("duelcoins_balance")
        .eq("user_id", user.id)
        .single();
      if (data) {
        setUserBalance(data.duelcoins_balance || 0);
      }
    }
  };

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

    if (userBalance < prizePool) {
      toast({
        title: "Saldo insuficiente",
        description: `Você precisa de ${prizePool.toLocaleString()} DuelCoins para criar este torneio.`,
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    try {
      // Try RPC first (works after cache is updated)
      const { data, error } = await supabase.rpc("create_weekly_tournament", {
        p_name: name,
        p_description: description,
        p_prize_pool: prizePool,
        p_entry_fee: entryFee,
        p_max_participants: 32,
      });

      if (error) {
        // If RPC fails due to schema cache, try direct insert with balance deduction
        
        // Check balance first
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('duelcoins_balance')
          .eq('user_id', user.id)
          .single();
        
        if (profileError || (profile.duelcoins_balance || 0) < prizePool) {
          throw new Error('Saldo insuficiente para criar este torneio');
        }
        
        // Deduct prize from balance
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ duelcoins_balance: profile.duelcoins_balance - prizePool })
          .eq('user_id', user.id);
        
        if (updateError) throw updateError;
        
        // Record transaction
        await supabase.from('duelcoins_transactions').insert({
          sender_id: user.id,
          amount: prizePool,
          transaction_type: 'tournament_prize',
          description: 'Pagamento antecipado de premio - Torneio Semanal: ' + name
        });
        
        // Create tournament
        const { data: tournament, error: insertError } = await supabase
          .from('tournaments')
          .insert({
            name: name,
            description: description,
            start_date: new Date().toISOString(),
            end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            max_participants: 32,
            prize_pool: prizePool,
            entry_fee: entryFee,
            created_by: user.id,
            status: 'upcoming',
            is_weekly: true,
            tournament_type: 'single_elimination',
            total_rounds: 5
          })
          .select()
          .single();

        if (insertError) throw insertError;

        toast({
          title: "Torneio Semanal criado com sucesso!",
          description: (
            <div className="space-y-2">
              <p>O seu Torneio Semanal está pronto!</p>
              <p className="text-sm text-muted-foreground">
                🏆 Prêmio: {prizePool.toLocaleString()} DC | Taxa: {entryFee.toLocaleString()} DC
              </p>
            </div>
          ),
        });
        navigate(`/tournament/${tournament.id}`);
        return;
      }

      if (data?.success) {
        toast({
          title: "Torneio Semanal criado com sucesso!",
          description: (
            <div className="space-y-2">
              <p>O seu Torneio Semanal está pronto!</p>
              <p className="text-sm text-muted-foreground">
                🏆 Prêmio: {prizePool.toLocaleString()} DC | Taxa: {entryFee.toLocaleString()} DC
              </p>
            </div>
          ),
        });
        navigate(`/tournament/${data.tournament_id}`);
      } else {
        throw new Error(data?.message || "Erro ao criar torneio");
      }
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

  const potentialProfit = (32 * entryFee) - prizePool;

  if (loadingAccountType) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 pt-24 pb-12">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        </main>
      </div>
    );
  }

  if (!isPro) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 pt-20 sm:pt-24 pb-12">
        <Card className="max-w-2xl mx-auto card-mystic">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-yellow-500/20 rounded-lg">
                <Trophy className="w-6 h-6 text-yellow-600" />
              </div>
              <div>
                <CardTitle className="text-2xl font-bold text-gradient-mystic">
                  Criar Torneio Semanal
                </CardTitle>
                <CardDescription>
                  Torneio automático com 32 participantes e duração de 1 semana
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Saldo Atual */}
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 rounded-lg mb-6">
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-medium">Seu Saldo Atual</span>
              </div>
              <DuelCoinsBalance />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Nome do Torneio</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Ex: Torneio Semanal #1"
                />
              </div>

              <div>
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  placeholder="Descreva seu torneio..."
                  rows={3}
                />
              </div>

              {/* Premio e Taxa */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="prizePool" className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-yellow-600" />
                    Prêmio (DuelCoins)
                  </Label>
                  <Input
                    id="prizePool"
                    type="number"
                    value={prizePool}
                    onChange={(e) => {
                      const value = e.target.value;
                      const parsed = parseInt(value);
                      if (!isNaN(parsed) && parsed >= 0) {
                        setPrizePool(parsed);
                      }
                    }}
                    min={1}
                    required
                    className="border-yellow-500/50 focus:border-yellow-500"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    💰 Será deduzido do seu saldo na criação
                  </p>
                </div>

                <div>
                  <Label htmlFor="entryFee" className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-blue-600" />
                    Taxa de Inscrição
                  </Label>
                  <Input
                    id="entryFee"
                    type="number"
                    value={entryFee}
                    onChange={(e) => {
                      const value = e.target.value;
                      const parsed = parseInt(value);
                      if (!isNaN(parsed) && parsed >= 0) {
                        setEntryFee(parsed);
                      }
                    }}
                    min={0}
                    required
                    className="border-blue-500/50 focus:border-blue-500"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    💵 Você receberá isso de cada participante
                  </p>
                </div>
              </div>

              {/* Info do Torneio */}
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Participantes
                  </span>
                  <span className="font-medium">32 (máximo)</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Duração
                  </span>
                  <span className="font-medium">7 dias</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <Trophy className="w-4 h-4" />
                    Premio Total
                  </span>
                  <span className="font-bold text-yellow-600">
                    {prizePool.toLocaleString()} DC
                  </span>
                </div>
              </div>

              {/* Simulacao de Lucro */}
              {entryFee > 0 && (
                <div
                  className={`p-4 rounded-lg ${
                    potentialProfit >= 0
                      ? "bg-green-500/10 border border-green-500/20"
                      : "bg-red-500/10 border border-red-500/20"
                  }`}
                >
                  <p className={`text-sm font-medium ${potentialProfit >= 0 ? "text-green-700" : "text-red-700"}`}>
                    📊 Simulação de Lucro (32 participantes):
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm">Arrecadação:</span>
                    <span className="font-bold">
                      +{(32 * entryFee).toLocaleString()} DC
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-sm">Prêmio pago:</span>
                    <span className="font-bold">-{prizePool.toLocaleString()} DC</span>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-current">
                    <span className="text-sm font-medium">Lucro líquido:</span>
                    <span className="font-bold text-lg">
                      {potentialProfit >= 0 ? "+" : ""}
                      {potentialProfit.toLocaleString()} DC
                    </span>
                  </div>
                </div>
              )}

              <Button
                type="submit"
                className="w-full btn-mystic text-white"
                disabled={loading || userBalance < prizePool}
              >
                {loading ? (
                  "Criando..."
                ) : userBalance < prizePool ? (
                  "Saldo Insuficiente"
                ) : (
                  <>
                    <Trophy className="w-4 h-4 mr-2" />
                    Criar Torneio Semanal
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default CreateWeeklyTournament;
