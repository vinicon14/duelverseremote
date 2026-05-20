/**
 * DuelVerse - Desafio 2FA durante o login
 * Exibido quando o usuário tem 2FA habilitado e precisa fornecer o código TOTP.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Shield, Loader2 } from "lucide-react";

interface TwoFactorChallengeProps {
  factorId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export const TwoFactorChallenge = ({ factorId, onSuccess, onCancel }: TwoFactorChallengeProps) => {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [challengeId, setChallengeId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.auth.mfa.challenge({ factorId });
        if (error) throw error;
        setChallengeId(data.id);
      } catch (err: any) {
        toast.error(err.message || "Erro ao iniciar verificação 2FA");
        onCancel();
      }
    })();
  }, [factorId, onCancel]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challengeId || code.length < 6) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: code.trim(),
      });
      if (error) throw error;
      toast.success("Verificado com sucesso");
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || "Código inválido");
      setCode("");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    await supabase.auth.signOut();
    onCancel();
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Verificação em dois fatores
        </CardTitle>
        <CardDescription>
          Digite o código de 6 dígitos do seu app autenticador para continuar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleVerify} className="space-y-4">
          <div className="space-y-2">
            <Label>Código de verificação</Label>
            <Input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              maxLength={6}
              className="text-center text-2xl tracking-widest font-mono"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={loading || code.length < 6} className="flex-1">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Verificar
            </Button>
            <Button type="button" variant="outline" onClick={handleCancel} disabled={loading}>
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
