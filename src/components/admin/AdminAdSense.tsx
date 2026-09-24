import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ADSENSE_KEYS, DEFAULT_ADSENSE_CLIENT, clearSiteAdsCache } from "@/hooks/useSiteAds";

export const AdminAdSense = () => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ enabled: false, client: DEFAULT_ADSENSE_CLIENT, slotTop: "", slotInline: "" });

  useEffect(() => {
    supabase.from("system_settings").select("key, value").in("key", Object.values(ADSENSE_KEYS)).then(({ data }) => {
      const m = new Map((data || []).map((r) => [r.key, r.value ?? ""]));
      setForm({
        enabled: m.get(ADSENSE_KEYS.enabled) === "true",
        client: m.get(ADSENSE_KEYS.client) || DEFAULT_ADSENSE_CLIENT,
        slotTop: m.get(ADSENSE_KEYS.slotTop) || "",
        slotInline: m.get(ADSENSE_KEYS.slotInline) || "",
      });
    });
  }, []);

  const save = async () => {
    if (form.enabled && !/^ca-pub-\d{10,20}$/.test(form.client.trim())) {
      toast({ title: "ID do editor inválido", description: "Use o formato ca-pub-0000000000000000", variant: "destructive" });
      return;
    }
    setSaving(true);
    const rows = [
      { key: ADSENSE_KEYS.enabled, value: String(form.enabled) },
      { key: ADSENSE_KEYS.client, value: form.client.trim() },
      { key: ADSENSE_KEYS.slotTop, value: form.slotTop.replace(/\D/g, "") },
      { key: ADSENSE_KEYS.slotInline, value: form.slotInline.replace(/\D/g, "") },
    ];
    const { error } = await supabase.from("system_settings").upsert(rows, { onConflict: "key" });
    setSaving(false);
    clearSiteAdsCache();
    toast(error ? { title: "Erro ao salvar", description: error.message, variant: "destructive" } : { title: "Configuração salva" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Banners do Google AdSense</CardTitle>
        <CardDescription>
          Aparecem só quando não houver anúncio próprio ativo naquele local. Nunca para PRO, landing pages ou salas de duelo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
          <Label>Exibir banners do Google</Label>
        </div>
        <div>
          <Label>ID do editor (ca-pub-...)</Label>
          <Input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label>Bloco do topo das páginas (número)</Label>
            <Input inputMode="numeric" placeholder="ex.: 1234567890" value={form.slotTop} onChange={(e) => setForm({ ...form, slotTop: e.target.value })} />
          </div>
          <div>
            <Label>Bloco entre itens (número)</Label>
            <Input inputMode="numeric" placeholder="ex.: 1234567890" value={form.slotInline} onChange={(e) => setForm({ ...form, slotInline: e.target.value })} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Os números dos blocos ficam no AdSense em Anúncios → Por bloco de anúncios.</p>
        <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
      </CardContent>
    </Card>
  );
};
