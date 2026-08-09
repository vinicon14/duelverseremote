/**
 * DuelVerse - Reset da Ranqueada (Admin)
 * Zera os pontos da ranqueada ao iniciar uma nova temporada/banlist.
 */
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RotateCcw, TriangleAlert } from "lucide-react";

export function AdminRankingReset() {
  const [tcg, setTcg] = useState<string>("all");
  const [resetRecord, setResetRecord] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleReset = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase.rpc as any)("admin_reset_ranked_points", {
        p_tcg_type: tcg === "all" ? null : tcg,
        p_reset_record: resetRecord,
      });
      if (error) throw error;
      toast({
        title: "Ranqueada resetada",
        description: `${data?.tcg_profiles_reset ?? 0} perfis de TCG atualizados.`,
      });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RotateCcw className="w-5 h-5 text-destructive" />
          Resetar Ranqueada
        </CardTitle>
        <CardDescription>
          Zera os pontos de ranking de todos os jogadores. Use ao iniciar uma nova temporada ou quando uma nova Banlist entrar em vigor.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 max-w-xs">
          <Label>TCG</Label>
          <Select value={tcg} onValueChange={setTcg}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              <SelectItem value="advanced">Yu-Gi-Oh! Advanced</SelectItem>
              <SelectItem value="rush">Yu-Gi-Oh! Rush Duel</SelectItem>
              <SelectItem value="genesis">Yu-Gi-Oh! Genesis</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-3">
          <Switch id="reset-record" checked={resetRecord} onCheckedChange={setResetRecord} />
          <Label htmlFor="reset-record">Também zerar vitórias e derrotas</Label>
        </div>

        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <TriangleAlert className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          Esta ação é irreversível.
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-2" />}
              Resetar Ranqueada
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar reset da ranqueada?</AlertDialogTitle>
              <AlertDialogDescription>
                Todos os pontos {tcg === "all" ? "de todos os TCGs" : `do TCG selecionado`} serão zerados
                {resetRecord ? ", incluindo vitórias e derrotas" : ""}. Não é possível desfazer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleReset}>Confirmar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
