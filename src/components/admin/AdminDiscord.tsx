/**
 * DuelVerse - Admin Discord Manager
 * Gerencia os servidores Discord conectados ao DuelVerse com setup automático.
 */
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Loader2,
  RefreshCw,
  ExternalLink,
  Save,
  Server,
  CheckCircle,
  XCircle,
  Trash2,
  Wand2,
  ChevronDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface DiscordServer {
  id: string;
  name: string;
  enabled: boolean;
  channelId: string;
  inviteLink?: string;
  webhookUrl?: string;
}

interface DiscordBotStatus {
  botId: string;
  botName: string;
  inviteLink: string;
  duelverseUrl: string;
  status: string;
  servers: DiscordServer[];
}

interface GuildEntry {
  guildId: string;
  guildName: string;
  channels: { id: string; name: string }[];
}

export function AdminDiscord() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [botStatus, setBotStatus] = useState<DiscordBotStatus | null>(null);
  const [servers, setServers] = useState<DiscordServer[]>([]);

  // Auto-setup state
  const [guilds, setGuilds] = useState<GuildEntry[]>([]);
  const [loadingGuilds, setLoadingGuilds] = useState(false);
  const [selectedGuildId, setSelectedGuildId] = useState<string>("");
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");

  // Manual fallback state
  const [newServerId, setNewServerId] = useState("");
  const [newServerName, setNewServerName] = useState("");
  const [newChannelId, setNewChannelId] = useState("");
  const [newInviteLink, setNewInviteLink] = useState("");
  const [newWebhookUrl, setNewWebhookUrl] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchBotStatus();
  }, []);

  const fetchBotStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "discord_bot_status")
        .maybeSingle();

      if (fetchError && fetchError.code !== "PGRST116") {
        console.error("Erro ao buscar status do bot:", fetchError);
        setError("Erro ao carregar configurações");
      }

      const defaultStatus: DiscordBotStatus = {
        botId: "1495723127357833256",
        botName: "duelverse",
        inviteLink:
          "https://discord.com/oauth2/authorize?client_id=1495723127357833256&permissions=8&scope=bot",
        duelverseUrl: "https://duelverse.site",
        status: "online",
        servers: [],
      };

      if (data?.value) {
        try {
          const parsed =
            typeof data.value === "string" ? JSON.parse(data.value) : data.value;
          setBotStatus(parsed);
          setServers(parsed.servers || []);
        } catch {
          setBotStatus(defaultStatus);
          setServers([]);
        }
      } else {
        setBotStatus(defaultStatus);
        setServers([]);
      }
    } catch (err) {
      console.error("Erro ao buscar status:", err);
      setError("Erro de conexão");
    } finally {
      setLoading(false);
    }
  };

  const saveToSupabase = async (newServers: DiscordServer[]) => {
    const newStatus: DiscordBotStatus = {
      botId: botStatus?.botId || "1495723127357833256",
      botName: botStatus?.botName || "duelverse",
      inviteLink:
        botStatus?.inviteLink ||
        "https://discord.com/oauth2/authorize?client_id=1495723127357833256&permissions=8&scope=bot",
      duelverseUrl: botStatus?.duelverseUrl || "https://duelverse.site",
      status: "online",
      servers: newServers,
    };

    const { error: upsertError } = await supabase
      .from("system_settings")
      .upsert(
        { key: "discord_bot_status", value: JSON.stringify(newStatus) },
        { onConflict: "key" }
      );
    if (upsertError) throw upsertError;

    setBotStatus(newStatus);
    setServers(newServers);
  };

  const handleToggleServer = async (serverId: string, enabled: boolean) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const newServers = servers.map((s) =>
        s.id === serverId ? { ...s, enabled } : s
      );
      await saveToSupabase(newServers);
      setSuccess("Servidor atualizado");
    } catch (err) {
      console.error(err);
      setError("Erro ao atualizar servidor");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveServer = async (serverId: string) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const newServers = servers.filter((s) => s.id !== serverId);
      await saveToSupabase(newServers);
      setSuccess("Servidor removido");
    } catch (err) {
      console.error(err);
      setError("Erro ao remover servidor");
    } finally {
      setSaving(false);
    }
  };

  const loadGuilds = async () => {
    setLoadingGuilds(true);
    setError(null);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke(
        "discord-bridge",
        { body: { type: "list_guilds" } }
      );
      if (invokeErr) throw invokeErr;
      if (!data?.success) {
        throw new Error(data?.error || "Falha ao listar servidores");
      }
      setGuilds(data.guilds || []);
      setSuccess(`${data.guilds?.length || 0} servidor(es) encontrado(s)`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao carregar servidores do Discord");
    } finally {
      setLoadingGuilds(false);
    }
  };

  const handleAutoSetup = async () => {
    if (!selectedGuildId || !selectedChannelId) {
      setError("Selecione um servidor e um canal");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke(
        "discord-bridge",
        {
          body: {
            type: "auto_setup_server",
            guildId: selectedGuildId,
            channelId: selectedChannelId,
          },
        }
      );
      if (invokeErr) throw invokeErr;
      if (!data?.success) {
        throw new Error(data?.error || "Falha no setup automático");
      }
      await fetchBotStatus();
      setSelectedGuildId("");
      setSelectedChannelId("");
      setSuccess(`Servidor "${data.server.name}" configurado automaticamente!`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro no setup automático");
    } finally {
      setSaving(false);
    }
  };

  const handleManualAdd = async () => {
    if (!newServerId || !newChannelId) {
      setError("ID do servidor e do canal são obrigatórios");
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const existingServer = servers.find((s) => s.id === newServerId);
      if (existingServer) {
        setError("Servidor já existe");
        setSaving(false);
        return;
      }
      const newServers = [
        ...servers,
        {
          id: newServerId,
          name: newServerName || `Server ${newServerId}`,
          enabled: true,
          channelId: newChannelId,
          inviteLink: newInviteLink || `https://discord.gg/${newChannelId}`,
          webhookUrl: newWebhookUrl,
        },
      ];
      await saveToSupabase(newServers);
      setNewServerId("");
      setNewServerName("");
      setNewChannelId("");
      setNewInviteLink("");
      setNewWebhookUrl("");
      setSuccess("Servidor adicionado");
    } catch (err) {
      console.error(err);
      setError("Erro ao adicionar servidor");
    } finally {
      setSaving(false);
    }
  };

  const selectedGuild = guilds.find((g) => g.guildId === selectedGuildId);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Server className="w-5 h-5" />
              Discord
            </CardTitle>
            <CardDescription>
              Gerencie servidores Discord conectados ao DuelVerse
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchBotStatus} disabled={saving}>
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            <span className="ml-2">Sincronizar</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {botStatus && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-muted p-4 rounded-lg">
              <Label className="text-muted-foreground">Status</Label>
              <div className="flex items-center gap-2 mt-1">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="font-medium capitalize">{botStatus.status}</span>
              </div>
            </div>
            <div className="bg-muted p-4 rounded-lg">
              <Label className="text-muted-foreground">Bot</Label>
              <p className="font-medium">{botStatus.botName}</p>
            </div>
            <div className="bg-muted p-4 rounded-lg">
              <Label className="text-muted-foreground">Convite</Label>
              <a
                href={botStatus.inviteLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                Abrir convite
              </a>
            </div>
          </div>
        )}

        <div className="border rounded-lg overflow-hidden">
          <div className="bg-muted px-4 py-3 font-medium flex items-center justify-between">
            <span>Servidores conectados</span>
            <Badge variant="secondary">{servers.length}</Badge>
          </div>
          <div className="divide-y">
            {servers.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                Nenhum servidor conectado
              </div>
            ) : (
              servers.map((server) => (
                <div
                  key={server.id}
                  className="p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    {server.enabled ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <XCircle className="w-4 h-4 text-muted-foreground" />
                    )}
                    <div>
                      <p className="font-medium">{server.name}</p>
                      <p className="text-sm text-muted-foreground">ID: {server.id}</p>
                      {server.channelId && (
                        <p className="text-sm text-muted-foreground">
                          Canal: {server.channelId}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={server.enabled}
                      onCheckedChange={(checked) =>
                        handleToggleServer(server.id, checked)
                      }
                      disabled={saving}
                    />
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRemoveServer(server.id)}
                      disabled={saving}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Auto-setup */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wand2 className="w-4 h-4" />
              Adicionar servidor automaticamente
            </CardTitle>
            <CardDescription>
              Selecione um servidor onde o bot está e o canal desejado. Webhook e convite são criados automaticamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={loadGuilds}
              disabled={loadingGuilds}
              variant="outline"
              size="sm"
            >
              {loadingGuilds ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Buscar servidores do bot
            </Button>

            {guilds.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Servidor</Label>
                  <Select
                    value={selectedGuildId}
                    onValueChange={(v) => {
                      setSelectedGuildId(v);
                      setSelectedChannelId("");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um servidor" />
                    </SelectTrigger>
                    <SelectContent>
                      {guilds.map((g) => (
                        <SelectItem key={g.guildId} value={g.guildId}>
                          {g.guildName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Canal</Label>
                  <Select
                    value={selectedChannelId}
                    onValueChange={setSelectedChannelId}
                    disabled={!selectedGuild}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um canal" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedGuild?.channels.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          #{c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end">
                  <Button
                    onClick={handleAutoSetup}
                    disabled={saving || !selectedGuildId || !selectedChannelId}
                    className="w-full"
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Wand2 className="w-4 h-4 mr-2" />
                    )}
                    Configurar
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Manual fallback */}
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between">
              <span>Adicionar manualmente (avançado)</span>
              <ChevronDown className="w-4 h-4" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Card className="mt-2">
              <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="serverId">ID do servidor</Label>
                    <Input
                      id="serverId"
                      value={newServerId}
                      onChange={(e) => setNewServerId(e.target.value)}
                      placeholder="Server ID"
                    />
                  </div>
                  <div>
                    <Label htmlFor="serverName">Nome</Label>
                    <Input
                      id="serverName"
                      value={newServerName}
                      onChange={(e) => setNewServerName(e.target.value)}
                      placeholder="Nome do servidor"
                    />
                  </div>
                  <div>
                    <Label htmlFor="channelId">ID do canal</Label>
                    <Input
                      id="channelId"
                      value={newChannelId}
                      onChange={(e) => setNewChannelId(e.target.value)}
                      placeholder="Channel ID"
                    />
                  </div>
                  <div>
                    <Label htmlFor="inviteLink">Link de convite</Label>
                    <Input
                      id="inviteLink"
                      value={newInviteLink}
                      onChange={(e) => setNewInviteLink(e.target.value)}
                      placeholder="https://discord.gg/xxx"
                    />
                  </div>
                  <div>
                    <Label htmlFor="webhookUrl">Webhook URL</Label>
                    <Input
                      id="webhookUrl"
                      type="password"
                      value={newWebhookUrl}
                      onChange={(e) => setNewWebhookUrl(e.target.value)}
                      placeholder="https://discord.com/api/webhooks/..."
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={handleManualAdd}
                      disabled={saving || !newServerId || !newChannelId}
                      className="w-full"
                    >
                      {saving ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      Adicionar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>

        {/* Discord -> DuelVerse via Slash Commands */}
        <Card className="border-primary/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              Discord → Chat Global (Slash Commands)
            </CardTitle>
            <CardDescription>
              Qualquer usuário do Discord pode replicar mensagens no Chat Global
              do DuelVerse usando os comandos <code className="bg-muted px-1 rounded">/dv</code> ou{" "}
              <code className="bg-muted px-1 rounded">/duelverse</code> seguidos da mensagem.
              Não é necessário rodar nenhum bot externo — tudo acontece via Edge Function.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="bg-muted p-3 rounded-lg">
              <p className="font-medium mb-1">Endpoint de Interactions (configure no Discord Developer Portal):</p>
              <code className="block text-xs break-all bg-background p-2 rounded">
                https://xxttwzewtqxvpgefggah.supabase.co/functions/v1/discord-interactions
              </code>
              <p className="text-xs text-muted-foreground mt-2">
                Cole essa URL em <strong>Application → General Information → Interactions Endpoint URL</strong>.
                O Discord vai validar com um PING — a função responde automaticamente.
              </p>
            </div>
            <div className="bg-muted p-3 rounded-lg">
              <p className="font-medium mb-1">Como usar (qualquer usuário no Discord):</p>
              <code className="block text-xs bg-background p-2 rounded">
                /dv mensagem aqui
              </code>
              <p className="text-xs text-muted-foreground mt-2">
                A mensagem aparece imediatamente no Chat Global do DuelVerse com o nome
                e avatar do Discord. Se o usuário tem conta vinculada, a mensagem é
                associada ao perfil DuelVerse.
              </p>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="bg-destructive/10 text-destructive p-3 rounded-lg">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-500/10 text-green-500 p-3 rounded-lg">
            {success}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
