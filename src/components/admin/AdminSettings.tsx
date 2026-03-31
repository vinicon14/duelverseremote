import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Save, Upload, ExternalLink, Monitor, Smartphone } from "lucide-react";

export const AdminSettings = () => {
  const [supportEmail, setSupportEmail] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [landingVideoUrl, setLandingVideoUrl] = useState("");
  const [ringtoneYgo, setRingtoneYgo] = useState("");
  const [ringtoneMtg, setRingtoneMtg] = useState("");
  const [ringtonePkm, setRingtonePkm] = useState("");
  const [windowsDownloadUrl, setWindowsDownloadUrl] = useState("");
  const [androidDownloadUrl, setAndroidDownloadUrl] = useState("");
  const [windowsFile, setWindowsFile] = useState<File | null>(null);
  const [androidFile, setAndroidFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadingWindows, setUploadingWindows] = useState(false);
  const [uploadingAndroid, setUploadingAndroid] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchSettings();
  }, []);

  const upsertSetting = async (key: string, value: string) => {
    const { error } = await supabase
      .from('system_settings')
      .upsert(
        { key, value, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );

    if (error) throw error;
  };

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*');

      if (error) throw error;

      if (data) {
        const emailSetting = data.find((s) => s.key === 'support_email');
        const pixSetting = data.find((s) => s.key === 'pix_key');
        const videoSetting = data.find((s) => s.key === 'landing_video_url');
        const ringYgo = data.find((s) => s.key === 'ringtone_ygo');
        const ringMtg = data.find((s) => s.key === 'ringtone_mtg');
        const ringPkm = data.find((s) => s.key === 'ringtone_pkm');
        const windowsSetting = data.find((s) => s.key === 'windows_download_url');
        const androidSetting = data.find((s) => s.key === 'android_download_url');

        if (emailSetting) setSupportEmail(emailSetting.value || '');
        if (pixSetting) setPixKey(pixSetting.value || '');
        if (videoSetting) setLandingVideoUrl(videoSetting.value || '');
        if (ringYgo) setRingtoneYgo(ringYgo.value || '');
        if (ringMtg) setRingtoneMtg(ringMtg.value || '');
        if (ringPkm) setRingtonePkm(ringPkm.value || '');
        if (windowsSetting) setWindowsDownloadUrl(windowsSetting.value || '');
        if (androidSetting) setAndroidDownloadUrl(androidSetting.value || '');
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const uploadAppFile = async (platform: 'windows' | 'android') => {
    const file = platform === 'windows' ? windowsFile : androidFile;
    const setUploading = platform === 'windows' ? setUploadingWindows : setUploadingAndroid;
    const setUrl = platform === 'windows' ? setWindowsDownloadUrl : setAndroidDownloadUrl;
    const setFile = platform === 'windows' ? setWindowsFile : setAndroidFile;

    if (!file) {
      toast({
        title: 'Selecione um arquivo',
        description: platform === 'windows' ? 'Escolha o arquivo do Windows antes de enviar.' : 'Escolha o APK do Android antes de enviar.',
        variant: 'destructive'
      });
      return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase() || '';

    if (platform === 'windows' && !['zip', 'exe'].includes(extension)) {
      toast({
        title: 'Formato inválido',
        description: 'Para Windows, envie um arquivo .zip ou .exe.',
        variant: 'destructive'
      });
      return;
    }

    if (platform === 'android' && extension !== 'apk') {
      toast({
        title: 'Formato inválido',
        description: 'Para Android, envie um arquivo .apk.',
        variant: 'destructive'
      });
      return;
    }

    setUploading(true);

    try {
      const targetPath = platform === 'windows'
        ? `windows/latest.${extension}`
        : 'android/latest.apk';

      const contentType = platform === 'android'
        ? 'application/vnd.android.package-archive'
        : extension === 'exe'
          ? 'application/vnd.microsoft.portable-executable'
          : 'application/zip';

      const { error: uploadError } = await supabase.storage
        .from('app-downloads')
        .upload(targetPath, file, {
          upsert: true,
          contentType,
          cacheControl: '3600'
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('app-downloads')
        .getPublicUrl(targetPath);

      const publicUrl = `${data.publicUrl}?t=${Date.now()}`;
      const settingKey = platform === 'windows' ? 'windows_download_url' : 'android_download_url';

      await upsertSetting(settingKey, publicUrl);
      setUrl(publicUrl);
      setFile(null);

      toast({
        title: 'Upload concluído',
        description: platform === 'windows' ? 'Arquivo do Windows publicado com sucesso.' : 'APK do Android publicado com sucesso.'
      });
    } catch (error: any) {
      console.error(`Error uploading ${platform} file:`, error);
      toast({
        title: 'Erro no upload',
        description: error.message || 'Não foi possível publicar o arquivo.',
        variant: 'destructive'
      });
    } finally {
      setUploading(false);
    }
  };

  const saveSettings = async () => {
    setLoading(true);
    try {
      const settings = [
        { key: 'support_email', value: supportEmail },
        { key: 'pix_key', value: pixKey },
        { key: 'landing_video_url', value: landingVideoUrl },
        { key: 'duel_ringtone_url', value: duelRingtoneUrl },
      ];

      for (const setting of settings) {
        await upsertSetting(setting.key, setting.value);
      }

      toast({
        title: 'Configurações salvas',
        description: 'As configurações foram atualizadas com sucesso!'
      });
    } catch (error: any) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Erro ao salvar',
        description: error.message || 'Não foi possível salvar as configurações',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Configurações do Sistema</h2>

      <Card>
        <CardHeader>
          <CardTitle>Configurações de Pagamento PRO</CardTitle>
          <CardDescription>
            Configure as informações para upgrade de conta
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="support-email">Email de Suporte</Label>
            <Input
              id="support-email"
              type="email"
              placeholder="suporte@exemplo.com"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Email para onde os usuários devem enviar comprovante de pagamento
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pix-key">Chave PIX (Cópia e Cola)</Label>
            <Input
              id="pix-key"
              placeholder="00020126580014br.gov.bcb.pix..."
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Chave PIX no formato cópia e cola para pagamentos
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Landing Page</CardTitle>
          <CardDescription>
            Configure o conteúdo exibido na página inicial para visitantes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="landing-video">URL do Vídeo da Landing Page</Label>
            <Input
              id="landing-video"
              type="url"
              placeholder="https://www.youtube.com/watch?v=... ou URL direta do vídeo"
              value={landingVideoUrl}
              onChange={(e) => setLandingVideoUrl(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Cole a URL de um vídeo do YouTube ou link direto de vídeo (.mp4). Será exibido na página inicial para visitantes.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>🔔 Toque de Convite de Duelo</CardTitle>
          <CardDescription>
            Configure o áudio que toca quando alguém recebe um convite de duelo (estilo chamada)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="duel-ringtone">URL do Vídeo/Áudio do YouTube</Label>
            <Input
              id="duel-ringtone"
              type="url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={duelRingtoneUrl}
              onChange={(e) => setDuelRingtoneUrl(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Cole a URL de um vídeo do YouTube. O áudio será extraído e tocado como toque de chamada quando um jogador receber um convite de duelo.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Downloads do app nativo</CardTitle>
          <CardDescription>
            Envie aqui a versão do Duelverse para Windows e o APK do Android.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-border p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Monitor className="w-5 h-5 text-primary" />
              <div>
                <h3 className="font-semibold">Windows</h3>
                <p className="text-sm text-muted-foreground">Aceita .zip ou .exe</p>
              </div>
            </div>

            <Input
              type="file"
              accept=".zip,.exe,application/zip,application/x-msdownload"
              onChange={(e) => setWindowsFile(e.target.files?.[0] || null)}
            />

            {windowsFile && (
              <p className="text-sm text-muted-foreground truncate">
                Selecionado: {windowsFile.name}
              </p>
            )}

            {windowsDownloadUrl && (
              <a
                href={windowsDownloadUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <ExternalLink className="w-4 h-4" />
                Ver arquivo publicado
              </a>
            )}

            <Button
              type="button"
              onClick={() => uploadAppFile('windows')}
              disabled={uploadingWindows}
              className="w-full"
            >
              <Upload className={`w-4 h-4 mr-2 ${uploadingWindows ? 'animate-spin' : ''}`} />
              {uploadingWindows ? 'Enviando...' : 'Publicar Windows'}
            </Button>
          </div>

          <div className="rounded-lg border border-border p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-primary" />
              <div>
                <h3 className="font-semibold">Android</h3>
                <p className="text-sm text-muted-foreground">Envie o arquivo .apk</p>
              </div>
            </div>

            <Input
              type="file"
              accept=".apk,application/vnd.android.package-archive"
              onChange={(e) => setAndroidFile(e.target.files?.[0] || null)}
            />

            {androidFile && (
              <p className="text-sm text-muted-foreground truncate">
                Selecionado: {androidFile.name}
              </p>
            )}

            {androidDownloadUrl && (
              <a
                href={androidDownloadUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <ExternalLink className="w-4 h-4" />
                Ver arquivo publicado
              </a>
            )}

            <Button
              type="button"
              onClick={() => uploadAppFile('android')}
              disabled={uploadingAndroid}
              className="w-full"
            >
              <Upload className={`w-4 h-4 mr-2 ${uploadingAndroid ? 'animate-spin' : ''}`} />
              {uploadingAndroid ? 'Enviando...' : 'Publicar Android'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Button
        onClick={saveSettings}
        disabled={loading}
        className="w-full"
      >
        <Save className="w-4 h-4 mr-2" />
        {loading ? 'Salvando...' : 'Salvar Configurações'}
      </Button>
    </div>
  );
};
