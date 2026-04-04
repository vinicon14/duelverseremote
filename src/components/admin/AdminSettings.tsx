import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Save, Upload, ExternalLink, Monitor, Smartphone, Music, Trash2 } from "lucide-react";

export const AdminSettings = () => {
  const [supportEmail, setSupportEmail] = useState("");
  
  const [landingVideoUrl, setLandingVideoUrl] = useState("");
  const [ringtoneYgo, setRingtoneYgo] = useState("");
  const [ringtoneMtg, setRingtoneMtg] = useState("");
  const [ringtonePkm, setRingtonePkm] = useState("");
  const [windowsDownloadUrl, setWindowsDownloadUrl] = useState("");
  const [androidDownloadUrl, setAndroidDownloadUrl] = useState("");
  const [windowsFile, setWindowsFile] = useState<File | null>(null);
  const [androidFile, setAndroidFile] = useState<File | null>(null);
  const [ringtoneFileYgo, setRingtoneFileYgo] = useState<File | null>(null);
  const [ringtoneFileMtg, setRingtoneFileMtg] = useState<File | null>(null);
  const [ringtoneFilePkm, setRingtoneFilePkm] = useState<File | null>(null);
  const [uploadingRingtone, setUploadingRingtone] = useState<string | null>(null);
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

  const uploadRingtone = async (tcg: 'ygo' | 'mtg' | 'pkm') => {
    const fileMap = { ygo: ringtoneFileYgo, mtg: ringtoneFileMtg, pkm: ringtoneFilePkm };
    const setFileMap = { ygo: setRingtoneFileYgo, mtg: setRingtoneFileMtg, pkm: setRingtoneFilePkm };
    const setUrlMap = { ygo: setRingtoneYgo, mtg: setRingtoneMtg, pkm: setRingtonePkm };
    const settingKey = `ringtone_${tcg}`;
    const file = fileMap[tcg];

    if (!file) {
      toast({ title: 'Selecione um arquivo de áudio', variant: 'destructive' });
      return;
    }

    setUploadingRingtone(tcg);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'mp3';
      const targetPath = `${tcg}/ringtone.${ext}`;
      const contentType = file.type || (ext === 'mp4' ? 'audio/mp4' : ext === 'wav' ? 'audio/wav' : ext === 'ogg' ? 'audio/ogg' : 'audio/mpeg');

      const { error: uploadError } = await supabase.storage
        .from('ringtones')
        .upload(targetPath, file, { upsert: true, cacheControl: '3600', contentType });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('ringtones').getPublicUrl(targetPath);
      const publicUrl = `${data.publicUrl}?t=${Date.now()}`;

      await upsertSetting(settingKey, publicUrl);
      setUrlMap[tcg](publicUrl);
      setFileMap[tcg](null);

      toast({ title: 'Toque enviado!', description: `Ringtone de ${tcg.toUpperCase()} atualizado.` });
    } catch (error: any) {
      console.error('Error uploading ringtone:', error);
      toast({ title: 'Erro no upload', description: error.message, variant: 'destructive' });
    } finally {
      setUploadingRingtone(null);
    }
  };

  const saveSettings = async () => {
    setLoading(true);
    try {
      const settings = [
        { key: 'support_email', value: supportEmail },
        { key: 'pix_key', value: pixKey },
        { key: 'landing_video_url', value: landingVideoUrl },
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
          <CardTitle>🔔 Toques de Convite de Duelo</CardTitle>
          <CardDescription>
            Envie arquivos de áudio (MP3, WAV, OGG, MP4) para cada TCG. O áudio tocará quando alguém receber um convite de duelo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {([
            { key: 'ygo' as const, label: '🎴 YGO (Yu-Gi-Oh!)', url: ringtoneYgo, file: ringtoneFileYgo, setFile: setRingtoneFileYgo },
            { key: 'mtg' as const, label: '🧙 MTG (Magic: The Gathering)', url: ringtoneMtg, file: ringtoneFileMtg, setFile: setRingtoneFileMtg },
            { key: 'pkm' as const, label: '⚡ PKM (Pokémon TCG)', url: ringtonePkm, file: ringtoneFilePkm, setFile: setRingtoneFilePkm },
          ]).map((tcg) => (
            <div key={tcg.key} className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Music className="w-4 h-4 text-primary" />
                <Label className="font-semibold">{tcg.label}</Label>
              </div>
              
              <Input
                type="file"
                accept="audio/*,video/mp4,.mp3,.wav,.ogg,.mp4,.m4a"
                onChange={(e) => tcg.setFile(e.target.files?.[0] || null)}
              />

              {tcg.file && (
                <p className="text-sm text-muted-foreground truncate">
                  Selecionado: {tcg.file.name}
                </p>
              )}

              {tcg.url && (
                <div className="flex items-center gap-2">
                  <audio controls src={tcg.url} className="h-8 flex-1" preload="none" />
                </div>
              )}

              <Button
                type="button"
                size="sm"
                onClick={() => uploadRingtone(tcg.key)}
                disabled={uploadingRingtone === tcg.key || !tcg.file}
                className="w-full"
              >
                <Upload className={`w-4 h-4 mr-2 ${uploadingRingtone === tcg.key ? 'animate-spin' : ''}`} />
                {uploadingRingtone === tcg.key ? 'Enviando...' : 'Enviar Toque'}
              </Button>
            </div>
          ))}
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
