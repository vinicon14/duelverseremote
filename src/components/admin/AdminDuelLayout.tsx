import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Save, RotateCcw, Monitor, Smartphone } from "lucide-react";

interface ElementPosition {
  x: number;
  y: number;
}

interface LayoutConfig {
  calculator_desktop: ElementPosition;
  calculator_mobile: ElementPosition;
  deck_viewer_desktop: ElementPosition;
  deck_viewer_mobile: ElementPosition;
  opponent_viewer_desktop: ElementPosition;
  opponent_viewer_mobile: ElementPosition;
}

const DEFAULT_CONFIG: LayoutConfig = {
  calculator_desktop: { x: 20, y: 100 },
  calculator_mobile: { x: 10, y: 80 },
  deck_viewer_desktop: { x: 8, y: 80 },
  deck_viewer_mobile: { x: 8, y: 80 },
  opponent_viewer_desktop: { x: 8, y: 80 },
  opponent_viewer_mobile: { x: 8, y: 80 },
};

const ELEMENT_LABELS: Record<string, { icon: string; label: string }> = {
  calculator: { icon: "🧮", label: "Calculadora de LP" },
  deck_viewer: { icon: "🃏", label: "Visualizador de Deck" },
  opponent_viewer: { icon: "👁️", label: "Visualizador do Oponente" },
};

export const AdminDuelLayout = () => {
  const [config, setConfig] = useState<LayoutConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("system_settings")
        .select("*")
        .eq("key", "duelroom_layout_config")
        .maybeSingle();

      if (error) throw error;

      if (data?.value) {
        try {
          const parsed = JSON.parse(data.value);
          setConfig({ ...DEFAULT_CONFIG, ...parsed });
        } catch {
          setConfig(DEFAULT_CONFIG);
        }
      }
    } catch (error) {
      console.error("Error fetching layout config:", error);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("system_settings")
        .upsert(
          {
            key: "duelroom_layout_config",
            value: JSON.stringify(config),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );

      if (error) throw error;

      toast({
        title: "Layout salvo!",
        description: "As posições padrão dos elementos foram atualizadas.",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = () => {
    setConfig(DEFAULT_CONFIG);
    toast({ title: "Resetado", description: "Valores restaurados para o padrão." });
  };

  const updatePosition = (
    element: string,
    platform: "desktop" | "mobile",
    axis: "x" | "y",
    value: string
  ) => {
    const key = `${element}_${platform}` as keyof LayoutConfig;
    const numValue = parseInt(value) || 0;
    setConfig((prev) => ({
      ...prev,
      [key]: { ...prev[key], [axis]: numValue },
    }));
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Carregando configurações...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Layout da Sala de Duelo</h2>
        <Button variant="outline" size="sm" onClick={resetToDefaults}>
          <RotateCcw className="w-4 h-4 mr-2" />
          Resetar Padrão
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Configure a posição padrão (X, Y em pixels) dos elementos flutuantes na Sala de Duelo.
        Os usuários ainda podem arrastar os elementos, mas estas serão as posições iniciais.
      </p>

      {Object.entries(ELEMENT_LABELS).map(([elementKey, { icon, label }]) => (
        <Card key={elementKey}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">
              {icon} {label}
            </CardTitle>
            <CardDescription>Posição inicial padrão do elemento</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {/* Desktop */}
              <div className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <Monitor className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-sm">Desktop</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Posição X (px)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={1920}
                      value={config[`${elementKey}_desktop` as keyof LayoutConfig].x}
                      onChange={(e) =>
                        updatePosition(elementKey, "desktop", "x", e.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Posição Y (px)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={1080}
                      value={config[`${elementKey}_desktop` as keyof LayoutConfig].y}
                      onChange={(e) =>
                        updatePosition(elementKey, "desktop", "y", e.target.value)
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Mobile */}
              <div className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <Smartphone className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-sm">Mobile</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Posição X (px)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={500}
                      value={config[`${elementKey}_mobile` as keyof LayoutConfig].x}
                      onChange={(e) =>
                        updatePosition(elementKey, "mobile", "x", e.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Posição Y (px)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={900}
                      value={config[`${elementKey}_mobile` as keyof LayoutConfig].y}
                      onChange={(e) =>
                        updatePosition(elementKey, "mobile", "y", e.target.value)
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <Button onClick={saveConfig} disabled={saving} className="w-full">
        <Save className="w-4 h-4 mr-2" />
        {saving ? "Salvando..." : "Salvar Layout"}
      </Button>
    </div>
  );
};
