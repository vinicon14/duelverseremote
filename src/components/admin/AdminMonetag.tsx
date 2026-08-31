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
import { MONETAG_KEYS, clearMonetagConfigCache, fetchMonetagConfig, isMonetagPushTag, showMonetagRewardedAd } from "@/utils/monetagAds";
import { MONETAG_PUSH_KEYS, clearMonetagPushConfigCache, fetchMonetagPushConfig } from "@/lib/push";
import { Loader2, Megaphone, Save, PlayCircle } from "lucide-react";

export function AdminMonetag() {
  const [enabled, setEnabled] = useState(false);
  const [zoneId, setZoneId] = useState("");
  const [sdkDomain, setSdkDomain] = useState("");
  const [customScript, setCustomScript] = useState("");
  const [minSeconds, setMinSeconds] = useState("15");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushTagUrl, setPushTagUrl] = useState("");
  const [pushScript, setPushScript] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      const [config, pushConfig] = await Promise.all([
        fetchMonetagConfig(true),
        fetchMonetagPushConfig(true),
      ]);
      setEnabled(config.enabled);
      setZoneId(config.zoneId);
      setSdkDomain(config.sdkDomain);
      setCustomScript(config.customScript);
      setMinSeconds(String(config.minSeconds));
      setPushEnabled(pushConfig.enabled);
      setPushTagUrl(pushConfig.tagUrl);
      setPushScript(pushConfig.script);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const customScriptIsPush = isMonetagPushTag(customScript);
      const rewardedScript = customScriptIsPush ? "" : customScript;
      const nextPushScript = customScriptIsPush && !pushScript.trim() ? customScript : pushScript;
      const nextPushEnabled = customScriptIsPush ? true : pushEnabled;
      const rows = [
        { key: MONETAG_KEYS.enabled, value: String(enabled) },
        { key: MONETAG_KEYS.zoneId, value: zoneId.trim() },
        { key: MONETAG_KEYS.sdkDomain, value: sdkDomain.trim() },
        { key: MONETAG_KEYS.customScript, value: rewardedScript },
        { key: MONETAG_KEYS.minSeconds, value: String(Math.max(3, Number(minSeconds) || 15)) },
        { key: MONETAG_PUSH_KEYS.enabled, value: String(nextPushEnabled) },
        { key: MONETAG_PUSH_KEYS.tagUrl, value: pushTagUrl.trim() },
        { key: MONETAG_PUSH_KEYS.script, value: nextPushScript },
      ];
      const { error } = await supabase.from("system_settings").upsert(rows, { onConflict: "key" });
      if (error) throw error;
      clearMonetagConfigCache();
      clearMonetagPushConfigCache();
      if (customScriptIsPush) {
        setCustomScript("");
        setPushScript(nextPushScript);
        setPushEnabled(true);
      }
      toast({
        title: "Configuração salva",
        description: customScriptIsPush
          ? "A tag de Push foi movida para a seção correta. O anúncio recompensado usará o Zone ID configurado."
          : "As alterações já valem para novos anúncios.",
      });
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
            <Input value={sdkDomain} onChange={(e) => setSdkDomain(e.target.value)} placeholder="libtl.com" />
          </div>
          <div className="space-y-1">
            <Label>Tempo mínimo para recompensa</Label>
            <Input value={minSeconds} onChange={(e) => setMinSeconds(e.target.value)} inputMode="numeric" placeholder="15" />
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
            Cole somente a tag Rewarded/Interstitial que contém data-zone e data-sdk. Tags tag.min.js devem ficar na seção Push abaixo.
          </p>
          {isMonetagPushTag(customScript) && (
            <p className="text-sm text-destructive">
              Esta é uma tag de Push. Ao salvar, ela será movida automaticamente para a seção correta.
            </p>
          )}
        </div>

        <div className="rounded-lg border border-border p-4 space-y-4">
          <div className="flex items-center gap-3">
            <Switch id="monetag-push-enabled" checked={pushEnabled} onCheckedChange={setPushEnabled} />
            <Label htmlFor="monetag-push-enabled">Ativar Push Monetag</Label>
          </div>

          <div className="space-y-1">
            <Label>URL da tag de Push</Label>
            <Input
              value={pushTagUrl}
              onChange={(e) => setPushTagUrl(e.target.value)}
              placeholder="https://.../tag.min.js?z=..."
            />
          </div>

          <div className="space-y-1">
            <Label>Script de Push oficial (opcional)</Label>
            <Textarea
              value={pushScript}
              onChange={(e) => setPushScript(e.target.value)}
              rows={4}
              placeholder='<script src="https://.../tag.min.js?z=..." data-cfasync="false" async></script>'
              className="font-mono text-xs"
            />
          </div>
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
