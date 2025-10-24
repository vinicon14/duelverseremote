import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Calendar, Users, Plus } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const AdminTournaments = () => {
  const [tournaments, setTournaments] = useState<any[]>([]);
  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [newTournament, setNewTournament] = useState({
    name: '',
    description: '',
    max_participants: 64,
    entry_fee: 100,
    prize_pool: 1000,
    start_time: '',
  });

  useEffect(() => {
    fetchTournaments();
  }, []);

  const fetchTournaments = async () => {
    try {
      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching tournaments:', error);
        toast({ title: "Erro ao carregar torneios", variant: "destructive" });
        return;
      }

      if (data) {
        setTournaments(data);
      }
    } catch (error) {
      console.error('Error:', error);
      toast({ title: "Erro ao carregar torneios", variant: "destructive" });
    }
  };

  const deleteTournament = async (tournamentId: string) => {
    if (!confirm('Tem certeza que deseja excluir este torneio?')) return;

    const { error } = await supabase
      .from('tournaments')
      .delete()
      .eq('id', tournamentId);
    
    if (error) {
      toast({ title: "Erro ao excluir torneio", variant: "destructive" });
    } else {
      toast({ title: "Torneio excluído com sucesso!" });
      fetchTournaments();
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: any }> = {
      upcoming: { label: "Próximo", variant: "default" },
      ongoing: { label: "Em Andamento", variant: "secondary" },
      completed: { label: "Finalizado", variant: "outline" },
    };
    
    const statusInfo = statusMap[status] || { label: status, variant: "default" };
    return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
  };

  const handleCreateTournament = async () => {
    if (!newTournament.name || !newTournament.start_time) {
      toast({ title: "Nome e data de início são obrigatórios.", variant: "destructive" });
      return;
    }

    setIsCreating(true);

    try {
      const { error } = await supabase.from('tournaments').insert({
        ...newTournament,
        start_time: new Date(newTournament.start_time).toISOString(),
      });

      if (error) throw error;

      toast({ title: "Torneio criado com sucesso!" });
      fetchTournaments();
      setNewTournament({
        name: '',
        description: '',
        max_participants: 64,
        entry_fee: 100,
        prize_pool: 1000,
        start_time: '',
      });
      // Fechar dialog aqui se necessário
    } catch (error: any) {
      toast({ title: "Erro ao criar torneio", description: error.message, variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setNewTournament(prev => ({ ...prev, [name]: value }));
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Gerenciar Torneios</h2>
        <Dialog>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Criar Novo Torneio
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo Torneio</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="name" className="text-right">Nome</Label>
                <Input id="name" name="name" value={newTournament.name} onChange={handleInputChange} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="description" className="text-right">Descrição</Label>
                <Textarea id="description" name="description" value={newTournament.description} onChange={handleInputChange} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="max_participants" className="text-right">Participantes</Label>
                <Input id="max_participants" name="max_participants" type="number" value={newTournament.max_participants} onChange={handleInputChange} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="entry_fee" className="text-right">Taxa (moedas)</Label>
                <Input id="entry_fee" name="entry_fee" type="number" value={newTournament.entry_fee} onChange={handleInputChange} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="prize_pool" className="text-right">Prêmio (moedas)</Label>
                <Input id="prize_pool" name="prize_pool" type="number" value={newTournament.prize_pool} onChange={handleInputChange} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="start_time" className="text-right">Data de Início</Label>
                <Input id="start_time" name="start_time" type="datetime-local" value={newTournament.start_time} onChange={handleInputChange} className="col-span-3" />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreateTournament} disabled={isCreating}>
                {isCreating ? "Criando..." : "Criar Torneio"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {tournaments.map((tournament) => (
          <Card key={tournament.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <CardTitle className="text-lg flex items-center gap-2">
                    {tournament.name}
                    {getStatusBadge(tournament.status)}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {tournament.description}
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4 mb-4 text-sm">
                <div className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  <span>Máx: {tournament.max_participants}</span>
                </div>
                {tournament.start_time && (
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    <span>
                      {format(new Date(tournament.start_time), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                )}
                <div>
                  <span className="font-semibold">Taxa: </span>
                  {tournament.entry_fee} moedas
                </div>
                <div>
                  <span className="font-semibold">Prêmio: </span>
                  {tournament.prize_pool} moedas
                </div>
              </div>
              
              <Button
                variant="destructive"
                size="sm"
                onClick={() => deleteTournament(tournament.id)}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Excluir Torneio
              </Button>
            </CardContent>
          </Card>
        ))}

        {tournaments.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhum torneio encontrado
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
