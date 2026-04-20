import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download, Check, Bell, Smartphone, Monitor, Share2, MoreVertical, Plus, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useBrowserNotifications } from "@/hooks/useBrowserNotifications";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { detectPlatform } from "@/utils/platformDetection";

export default function InstallApp() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [windowsDownloadUrl, setWindowsDownloadUrl] = useState("");
  const [androidDownloadUrl, setAndroidDownloadUrl] = useState("");
  const navigate = useNavigate();
  const { isSupported, hasPermission, requestPermission } = useBrowserNotifications();
  const { toast } = useToast();
  const platform = detectPlatform();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setIsAuthenticated(!!session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_ev, session) => setIsAuthenticated(!!session));

    if (window.matchMedia("(display-mode: standalone)").matches) setIsInstalled(true);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    const fetchDownloadLinks = async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('key, value')
        .in('key', ['windows_download_url', 'android_download_url']);

      if (!data) return;

      const windows = data.find((item) => item.key === 'windows_download_url')?.value || '';
      const android = data.find((item) => item.key === 'android_download_url')?.value || '';

      setWindowsDownloadUrl(windows);
      setAndroidDownloadUrl(android);
    };

    fetchDownloadLinks();
    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      subscription.unsubscribe();
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
      toast({ title: "App instalado!" });
    }
    setDeferredPrompt(null);
    setIsInstallable(false);
  };

  const handleNotifications = async () => {
    const ok = await requestPermission();
    if (ok) toast({ title: "Notificações ativadas!" });
  };

  const nativeDownloads = [
    {
      key: 'windows',
      title: 'Windows',
      description: 'Baixe a versão desktop para notificações mesmo com a janela fechada.',
      href: windowsDownloadUrl,
      icon: Monitor,
      visible: !!windowsDownloadUrl,
    },
    {
      key: 'android',
      title: 'Android APK',
      description: 'Instale o APK oficial para receber notificações no celular.',
      href: androidDownloadUrl,
      icon: Smartphone,
      visible: !!androidDownloadUrl,
    },
  ].filter((item) => item.visible);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6 text-center">
        <div className="space-y-2">
          <div className="text-6xl">⚔️</div>
          <h1 className="text-3xl font-bold">Instalar Duelverse</h1>
          <p className="text-muted-foreground text-sm">Use como app e mantenha as notificações ativas no desktop ou mobile</p>
        </div>

        {nativeDownloads.length > 0 && (
          <div className="space-y-3 text-left">
            {nativeDownloads.map((item) => {
              const Icon = item.icon;
              return (
                <a
                  key={item.key}
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">Baixar {item.title}</p>
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                      </div>
                    </div>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </div>
                </a>
              );
            })}
          </div>
        )}

        {isInstalled ? (
          <div className="bg-primary/10 border border-primary/30 rounded-2xl p-6 space-y-2">
            <Check className="h-12 w-12 text-primary mx-auto" />
            <p className="font-semibold text-lg">App já instalado!</p>
            <p className="text-sm text-muted-foreground">Abra pela tela inicial do seu dispositivo</p>
          </div>
        ) : isInstallable ? (
          <div className="space-y-3">
            <Button onClick={handleInstall} size="lg" className="w-full h-14 text-lg rounded-2xl btn-mystic text-white gap-2">
              <Download className="h-6 w-6" />
              Instalar Agora
            </Button>
            <p className="text-xs text-muted-foreground">Um toque e pronto! Aparece na sua tela inicial.</p>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl p-5 text-left space-y-4">
            <div className="flex items-center gap-3">
              {platform.isIOS ? <Smartphone className="h-5 w-5 text-primary" /> :
               platform.isAndroid ? <Smartphone className="h-5 w-5 text-primary" /> :
               <Monitor className="h-5 w-5 text-primary" />}
              <span className="font-semibold">
                {platform.isIOS ? "iPhone / iPad" : platform.isAndroid ? "Android" : "Computador"}
              </span>
            </div>

            {platform.isIOS ? (
              <ol className="space-y-3 text-sm">
                <StepItem icon={<Share2 className="h-4 w-4" />} text='Toque no botão "Compartilhar" 📤' />
                <StepItem icon={<Plus className="h-4 w-4" />} text='"Adicionar à Tela de Início"' />
                <StepItem icon={<Check className="h-4 w-4" />} text='Toque "Adicionar" e pronto!' />
              </ol>
            ) : platform.isAndroid ? (
              <ol className="space-y-3 text-sm">
                <StepItem icon={<MoreVertical className="h-4 w-4" />} text="Toque nos 3 pontos ⋮ do Chrome" />
                <StepItem icon={<Download className="h-4 w-4" />} text='"Instalar aplicativo"' />
                <StepItem icon={<Check className="h-4 w-4" />} text='Confirme e pronto!' />
              </ol>
            ) : (
              <ol className="space-y-3 text-sm">
                <StepItem icon={<Download className="h-4 w-4" />} text="Clique no ícone 📥 na barra de endereço" />
                <StepItem icon={<Check className="h-4 w-4" />} text='Clique "Instalar" e pronto!' />
              </ol>
            )}

            {platform.isIOS && (
              <p className="text-xs text-muted-foreground bg-muted rounded-lg p-2">
                ⚠️ Use o Safari. Chrome no iOS não suporta instalação.
              </p>
            )}
          </div>
        )}

        {isSupported && !isInstalled && (
          <div className="space-y-2">
            {hasPermission ? (
              <div className="flex items-center justify-center gap-2 text-sm text-primary">
                <Bell className="h-4 w-4" /> Notificações ativadas
              </div>
            ) : isAuthenticated ? (
              <Button onClick={handleNotifications} variant="outline" className="w-full rounded-2xl gap-2">
                <Bell className="h-4 w-4" /> Ativar Notificações Push
              </Button>
            ) : (
              <Button onClick={() => navigate('/auth')} variant="outline" className="w-full rounded-2xl gap-2">
                <Bell className="h-4 w-4" /> Faça login para notificações
              </Button>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          {["Tela cheia", "Funciona offline", "Notificações push", "Mais rápido"].map((t) => (
            <div key={t} className="flex items-center gap-1.5 bg-muted/50 rounded-lg p-2">
              <Check className="h-3 w-3 text-primary shrink-0" /> {t}
            </div>
          ))}
        </div>

        <Button onClick={() => navigate("/")} variant="ghost" size="sm" className="text-muted-foreground">
          ← Voltar
        </Button>
      </div>
    </div>
  );
}

function StepItem({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-center gap-3">
      <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0">{icon}</div>
      <span>{text}</span>
    </li>
  );
}
