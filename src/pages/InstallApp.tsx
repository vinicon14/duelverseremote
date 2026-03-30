import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, Monitor, Smartphone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";

export default function InstallApp() {
  const [windowsDownloadUrl, setWindowsDownloadUrl] = useState("");
  const [androidDownloadUrl, setAndroidDownloadUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const fetchDownloadLinks = async () => {
      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('key, value')
          .in('key', ['windows_download_url', 'android_download_url']);

        if (error) throw error;

        setWindowsDownloadUrl(data?.find((item) => item.key === 'windows_download_url')?.value || '');
        setAndroidDownloadUrl(data?.find((item) => item.key === 'android_download_url')?.value || '');
      } catch (error) {
        console.error('Error fetching download links:', error);
        toast({ title: 'Erro ao carregar downloads', description: 'Não foi possível carregar os links de download.', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    };

    fetchDownloadLinks();
  }, [toast]);

  const nativeDownloads = [
    {
      key: 'windows',
      title: 'Windows',
      description: 'Baixe o instalador direto do arquivo .exe enviado pelo administrador.',
      href: windowsDownloadUrl,
      icon: Monitor,
      visible: !!windowsDownloadUrl,
    },
    {
      key: 'android',
      title: 'Android APK',
      description: 'Baixe o APK oficial para instalar no celular.',
      href: androidDownloadUrl,
      icon: Smartphone,
      visible: !!androidDownloadUrl,
    },
  ].filter((item) => item.visible);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="max-w-xl w-full space-y-6 text-center">
        <div className="space-y-2">
          <div className="text-6xl">⚔️</div>
          <h1 className="text-3xl font-bold">Baixar Duelverse</h1>
          <p className="text-muted-foreground text-sm">
            Baixe o instalador direto do arquivo enviado pelo administrador.
          </p>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">Carregando links de download...</p>
          </div>
        ) : nativeDownloads.length > 0 ? (
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
        ) : (
          <div className="rounded-2xl border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">
              Nenhum instalador disponibilizado ainda. Peça para o administrador enviar o arquivo .exe ou .apk.
            </p>
          </div>
        )}

        <Button onClick={() => navigate("/")} variant="ghost" size="sm" className="text-muted-foreground">
          ← Voltar
        </Button>
      </div>
    </div>
  );
}
