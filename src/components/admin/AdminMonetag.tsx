/**
 * DuelVerse - Configuração de Anúncios (Monetag) — Admin
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { MONETAG_KEYS, clearMonetagConfigCache, fetchMonetagConfig, showMonetagRewardedAd } from "@/utils/monetagAds";
import { Loader2, Megaphone, Save, PlayCircle } from "lucide-react";

export function AdminMonetag() {
  const [enabled, setEnabled] = useState(false);
  const [zoneId, setZoneId] = useState("");
  const [sdkDomain, setSdkDomain] = useState("");
  const [customScript, setCustomScript] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const config = await fetchMonetagConfig(true);
      setEnabled(config.enabled);
      setZoneId(config.zoneId);
      setSdkDomain(config.sdkDomain);
      setCustomScript(config.customScript);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const rows = [
        { key: MONETAG_KEYS.enabled, value: String(enabled) },
        { key: MONETAG_KEYS.zoneId, value: zoneId.trim() },
        { key: MONETAG_KEYS.sdkDomain, value: sdkDomain.trim() },
        { key: MONETAG_KEYS.customScript, value: customScript },
      ];
      const { error } = await supabase.from("system_settings").upsert(rows, { onConflict: "key" });
      if (error) throw error;
      clearMonetagConfigCache();
      toast({ title: "Configuração salva", description: "As alterações já valem para novos anúncios." });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      await showMonetagRewardedAd();
      toast({ title: "Anúncio concluído", description: "A integração está funcionando." });
    } catch (err: any) {
      toast({ title: "Falha no teste", description: err.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-primary" />
          Anúncios (Monetag)
        </CardTitle>
        <CardDescription>
          Os anúncios aparecem somente quando o usuário clica em "Assistir anúncio" para receber recompensas.
          Nenhum banner é exibido pelo sistema.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch id="monetag-enabled" checked={enabled} onCheckedChange={setEnabled} />
          <Label htmlFor="monetag-enabled">Ativar anúncios recompensados</Label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Zone ID</Label>
            <Input value={zoneId} onChange={(e) => setZoneId(e.target.value)} placeholder="1234567" />
          </div>
          <div className="space-y-1">
            <Label>Domínio do SDK</Label>
            <Input value={sdkDomain} onChange={(e) => setSdkDomain(e.target.value)} placeholder="vemtoutchave.com" />
          </div>
        </div>

        <div className="space-y-1">
          <Label>Script personalizado (opcional)</Label>
          <Textarea
            value={customScript}
            onChange={(e) => setCustomScript(e.target.value)}
            rows={6}
            placeholder='<script src="https://..." data-zone="..." data-sdk="show_..."></script>'
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Cole aqui o código fornecido pela Monetag. Ele é carregado apenas sob demanda, no momento do anúncio.
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button className="btn-mystic" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar
          </Button>
          <Button variant="outline" onClick={test} disabled={testing || !enabled}>
            {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
            Testar anúncio
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
