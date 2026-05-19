import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BadgeCheck, Loader2, ShieldCheck, Clock, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatCpf, isValidCpf, onlyDigits } from "@/utils/cpf";

interface Props {
  userId: string | null;
  isVerified: boolean;
}

export const VerificationCard = ({ userId, isVerified }: Props) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [request, setRequest] = useState<any>(null);
  const [fullName, setFullName] = useState("");
  const [cpf, setCpf] = useState("");
  const [birthDate, setBirthDate] = useState("");

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await supabase
        .from("verification_requests" as any)
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setRequest(data);
    })();
  }, [userId]);

  const submit = async () => {
    if (!userId) return;
    if (fullName.trim().length < 3) {
      toast({ title: "Nome inválido", description: "Digite seu nome completo", variant: "destructive" });
      return;
    }
    if (!isValidCpf(cpf)) {
      toast({ title: "CPF inválido", description: "Verifique os dígitos do CPF", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("verification_requests" as any)
      .insert({
        user_id: userId,
        full_name: fullName.trim(),
        cpf: onlyDigits(cpf),
        birth_date: birthDate || null,
        status: "pending",
      })
      .select()
      .maybeSingle();
    setLoading(false);
    if (error) {
      toast({ title: "Erro ao enviar", description: error.message, variant: "destructive" });
      return;
    }
    setRequest(data);
    toast({ title: "✅ Pedido enviado", description: "Sua verificação está em análise." });
  };

  return (
    <Card className="card-mystic border-sky-500/40">
      <CardHeader>
        <CardTitle className="text-2xl flex items-center gap-2">
          <BadgeCheck className="w-6 h-6 text-sky-500" />
          Verificação de Conta
          <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-500 font-semibold ml-2">
            GRÁTIS
          </span>
        </CardTitle>
        <CardDescription>
          Ganhe um selo de verificado para aumentar sua credibilidade na plataforma. A verificação é feita via CPF.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isVerified ? (
          <div className="flex items-center gap-3 p-4 bg-sky-500/10 border border-sky-500/40 rounded-lg">
            <ShieldCheck className="w-6 h-6 text-sky-500" />
            <div>
              <p className="font-bold">Sua conta está verificada</p>
              <p className="text-sm text-muted-foreground">Você já possui o selo de verificação.</p>
            </div>
          </div>
        ) : request?.status === "pending" ? (
          <div className="flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-500/40 rounded-lg">
            <Clock className="w-6 h-6 text-yellow-500" />
            <div>
              <p className="font-bold">Pedido em análise</p>
              <p className="text-sm text-muted-foreground">
                Enviado em {new Date(request.created_at).toLocaleString("pt-BR")}.
              </p>
            </div>
          </div>
        ) : (
          <>
            {request?.status === "rejected" && (
              <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/40 rounded-lg">
                <XCircle className="w-6 h-6 text-red-500 shrink-0" />
                <div>
                  <p className="font-bold">Pedido rejeitado</p>
                  <p className="text-sm text-muted-foreground">
                    {request.rejection_reason || "Você pode enviar um novo pedido abaixo."}
                  </p>
                </div>
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="ver-name">Nome completo (como no documento)</Label>
                <Input id="ver-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ex: João da Silva" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ver-cpf">CPF</Label>
                <Input
                  id="ver-cpf"
                  value={cpf}
                  onChange={(e) => setCpf(formatCpf(e.target.value))}
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  maxLength={14}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ver-birth">Data de nascimento (opcional)</Label>
                <Input id="ver-birth" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Seus dados são confidenciais e usados somente para verificação por nossa equipe.
            </p>
            <Button onClick={submit} disabled={loading || !userId} className="w-full">
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <BadgeCheck className="w-4 h-4 mr-2" />}
              Solicitar verificação
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};
