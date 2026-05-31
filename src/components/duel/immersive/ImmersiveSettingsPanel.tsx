/**
 * Painel de configurações do Modo Duelista Imersivo.
 *
 * Aberto via botão flutuante (ImmersiveOverlay). Organiza Áudio / Interface /
 * Animações / Automações / Acessibilidade em tabs. Toda mudança persiste
 * automaticamente via ImmersiveModeProvider.
 */
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useImmersiveMode } from "./ImmersiveModeProvider";
import { RotateCcw, Volume2, Layout, Sparkles, Wand2, Eye } from "lucide-react";

export const ImmersiveSettingsPanel = () => {
  const { settingsOpen, setSettingsOpen, settings, updateSetting, resetSettings, userEnabled, setUserEnabled } =
    useImmersiveMode();

  const SliderRow = ({
    label,
    value,
    onChange,
    min = 0,
    max = 100,
    step = 1,
    suffix = "%",
  }: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    min?: number;
    max?: number;
    step?: number;
    suffix?: string;
  }) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <span className="text-xs font-mono text-muted-foreground">
          {value}
          {suffix}
        </span>
      </div>
      <Slider value={[value]} onValueChange={(v) => onChange(v[0])} min={min} max={max} step={step} />
    </div>
  );

  return (
    <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Modo Duelista Imersivo
          </SheetTitle>
          <SheetDescription>
            Personalize áudio, interface e acessibilidade. Tudo é salvo automaticamente neste dispositivo.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <Label className="text-sm font-medium">Ativar Modo Imersivo</Label>
            <p className="text-xs text-muted-foreground">Quando desligado, mostra o Arena Digital padrão.</p>
          </div>
          <Switch checked={userEnabled} onCheckedChange={setUserEnabled} />
        </div>

        <Tabs defaultValue="audio" className="mt-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="audio" title="Áudio"><Volume2 className="h-4 w-4" /></TabsTrigger>
            <TabsTrigger value="ui" title="Interface"><Layout className="h-4 w-4" /></TabsTrigger>
            <TabsTrigger value="anim" title="Animações"><Sparkles className="h-4 w-4" /></TabsTrigger>
            <TabsTrigger value="auto" title="Automações"><Wand2 className="h-4 w-4" /></TabsTrigger>
            <TabsTrigger value="a11y" title="Acessibilidade"><Eye className="h-4 w-4" /></TabsTrigger>
          </TabsList>

          <TabsContent value="audio" className="mt-4 space-y-4">
            <SliderRow label="Música ambiente" value={settings.musicVolume} onChange={(v) => updateSetting("musicVolume", v)} />
            <SliderRow label="Efeitos sonoros" value={settings.sfxVolume} onChange={(v) => updateSetting("sfxVolume", v)} />
            <SliderRow label="Narração" value={settings.narrationVolume} onChange={(v) => updateSetting("narrationVolume", v)} />
            <SliderRow label="Chat de voz" value={settings.voiceChatVolume} onChange={(v) => updateSetting("voiceChatVolume", v)} />
          </TabsContent>

          <TabsContent value="ui" className="mt-4 space-y-4">
            <SliderRow label="Escala das cartas" value={settings.cardScale} onChange={(v) => updateSetting("cardScale", v)} min={0.8} max={1.4} step={0.05} suffix="x" />
            <SliderRow label="Escala dos LP" value={settings.lpScale} onChange={(v) => updateSetting("lpScale", v)} min={0.8} max={1.6} step={0.05} suffix="x" />
            <SliderRow label="Transparência dos painéis" value={settings.uiOpacity} onChange={(v) => updateSetting("uiOpacity", v)} />
          </TabsContent>

          <TabsContent value="anim" className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <Label>Animações ativadas</Label>
              <Switch checked={settings.animationsEnabled} onCheckedChange={(v) => updateSetting("animationsEnabled", v)} />
            </div>
            <SliderRow label="Velocidade" value={settings.animationSpeed} onChange={(v) => updateSetting("animationSpeed", v)} min={0.5} max={2} step={0.1} suffix="x" />
            <div className="flex items-center justify-between">
              <Label>Efeitos de invocação</Label>
              <Switch checked={settings.summonEffectsEnabled} onCheckedChange={(v) => updateSetting("summonEffectsEnabled", v)} />
            </div>
          </TabsContent>

          <TabsContent value="auto" className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <Label>Narração por voz</Label>
              <Switch checked={settings.narrationEnabled} onCheckedChange={(v) => updateSetting("narrationEnabled", v)} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Idioma da narração</Label>
              <Select value={settings.narrationLanguage} onValueChange={(v: any) => updateSetting("narrationLanguage", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt-BR">Português (BR)</SelectItem>
                  <SelectItem value="en-US">English (US)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Frequência da narração</Label>
              <Select value={settings.narrationFrequency} onValueChange={(v: any) => updateSetting("narrationFrequency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os eventos</SelectItem>
                  <SelectItem value="important">Apenas importantes</SelectItem>
                  <SelectItem value="off">Desligada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label>Leitura automática de efeitos</Label>
              <Switch checked={settings.cardEffectAutoRead} onCheckedChange={(v) => updateSetting("cardEffectAutoRead", v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Destacar alvos válidos</Label>
              <Switch checked={settings.highlightValidTargets} onCheckedChange={(v) => updateSetting("highlightValidTargets", v)} />
            </div>
          </TabsContent>

          <TabsContent value="a11y" className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">Modo daltônico</Label>
              <Select value={settings.colorblindMode} onValueChange={(v: any) => updateSetting("colorblindMode", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">Desligado</SelectItem>
                  <SelectItem value="protanopia">Protanopia</SelectItem>
                  <SelectItem value="deuteranopia">Deuteranopia</SelectItem>
                  <SelectItem value="tritanopia">Tritanopia</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label>Fontes ampliadas</Label>
              <Switch checked={settings.largeFonts} onCheckedChange={(v) => updateSetting("largeFonts", v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Alto contraste</Label>
              <Switch checked={settings.highContrast} onCheckedChange={(v) => updateSetting("highContrast", v)} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Legendas</Label>
              <Switch checked={settings.captions} onCheckedChange={(v) => updateSetting("captions", v)} />
            </div>
          </TabsContent>
        </Tabs>

        <Button variant="outline" size="sm" className="mt-6 w-full" onClick={resetSettings}>
          <RotateCcw className="mr-2 h-4 w-4" /> Restaurar padrões
        </Button>
      </SheetContent>
    </Sheet>
  );
};
