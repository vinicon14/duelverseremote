/**
 * DuelVerse - Configuração de 2FA (TOTP)
 * Permite ao usuário habilitar/desabilitar autenticação de dois fatores.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Shield, ShieldCheck, ShieldOff, Loader2, Copy } from "lucide-react";

type Factor = { id: string; status: string; friendly_name?: string | null };

export const TwoFactorSetup = () => {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enrolling, setEnrolling] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [verifyCode, setVerifyCode] = useState("");

  const verifiedFactor = factors.find((f) => f.status === "verified");
  const isEnabled = !!verifiedFactor;

  const loadFactors = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      const totp = (data?.totp || []) as any[];
      setFactors(totp.map((f) => ({ id: f.id, status: f.status, friendly_name: f.friendly_name })));
    } catch (err: any) {
      console.error("[2FA] list error", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFactors();
  }, []);

  const startEnroll = async () => {
    setActionLoading(true);
    try {
      // Limpar fatores não verificados pendentes
      for (const f of factors.filter((x) => x.status !== "verified")) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `DuelVerse ${new Date().toISOString().slice(0, 10)}`,
      });
      if (error) throw error;
      setEnrolling({
        factorId: data.id,
        qr: data.totp.qr_code,
        secret: data.totp.secret,
      });
    } catch (err: any) {
      toast.error(err.message || "Erro ao iniciar 2FA");
    } finally {
      setActionLoading(false);
    }
  };

  const verifyEnroll = async () => {
    if (!enrolling) return;
    if (verifyCode.trim().length < 6) {
      toast.error("Digite o código de 6 dígitos");
      return;
    }
    setActionLoading(true);
    try {
      const { data: challengeData, error: chErr } = await supabase.auth.mfa.challenge({
        factorId: enrolling.factorId,
      });
      if (chErr) throw chErr;
      const { error: verErr } = await supabase.auth.mfa.verify({
        factorId: enrolling.factorId,
        challengeId: challengeData.id,
        code: verifyCode.trim(),
      });
      if (verErr) throw verErr;
      toast.success("Autenticação de dois fatores ativada!");
      setEnrolling(null);
      setVerifyCode("");
      await loadFactors();
    } catch (err: any) {
      toast.error(err.message || "Código inválido");
    } finally {
      setActionLoading(false);
    }
  };

  const cancelEnroll = async () => {
    if (!enrolling) return;
    try {
      await supabase.auth.mfa.unenroll({ factorId: enrolling.factorId });
    } catch {}
    setEnrolling(null);
    setVerifyCode("");
    loadFactors();
  };

  const disable2FA = async () => {
    if (!verifiedFactor) return;
    if (!confirm("Tem certeza que deseja desativar o 2FA? Sua conta ficará menos protegida.")) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: verifiedFactor.id });
      if (error) throw error;
      toast.success("2FA desativado");
      await loadFactors();
    } catch (err: any) {
      toast.error(err.message || "Erro ao desativar");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="card-mystic">
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-mystic">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Autenticação de Dois Fatores (2FA)
        </CardTitle>
        <CardDescription>
          Adicione uma camada extra de segurança à sua conta usando um app autenticador
          (Google Authenticator, Authy, Microsoft Authenticator, etc.).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isEnabled && !enrolling && (
          <>
            <Alert className="border-green-500/40 bg-green-500/10">
              <ShieldCheck className="h-4 w-4 text-green-500" />
              <AlertDescription className="text-green-400 font-medium">
                2FA está ativo na sua conta. Você precisará do código do app autenticador a cada login.
              </AlertDescription>
            </Alert>
            <Button
              variant="destructive"
              onClick={disable2FA}
              disabled={actionLoading}
              className="gap-2"
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
              Desativar 2FA
            </Button>
          </>
        )}

        {!isEnabled && !enrolling && (
          <>
            <Alert>
              <AlertDescription>
                Sua conta <strong>não está</strong> protegida com 2FA. Recomendamos ativar para
                aumentar a segurança.
              </AlertDescription>
            </Alert>
            <Button onClick={startEnroll} disabled={actionLoading} className="gap-2">
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
              Ativar 2FA
            </Button>
          </>
        )}

        {enrolling && (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              1. Escaneie o QR code abaixo com seu app autenticador:
            </div>
            <div className="flex justify-center bg-white p-4 rounded-lg w-fit mx-auto">
              <img src={enrolling.qr} alt="QR Code 2FA" className="w-48 h-48" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Ou insira esta chave manualmente no app:
              </Label>
              <div className="flex gap-2">
                <Input value={enrolling.secret} readOnly className="font-mono text-xs" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(enrolling.secret);
                    toast.success("Chave copiada");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>2. Digite o código de 6 dígitos gerado pelo app:</Label>
              <Input
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
                maxLength={6}
                className="text-center text-2xl tracking-widest font-mono"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={verifyEnroll} disabled={actionLoading || verifyCode.length < 6} className="flex-1">
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Verificar e ativar
              </Button>
              <Button variant="outline" onClick={cancelEnroll} disabled={actionLoading}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
