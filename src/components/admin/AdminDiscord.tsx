/**
 * DuelVerse - Admin Discord Manager
 * Gerencia os servidores Discord conectados ao DuelVerse
 */
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, ExternalLink, Save, Server, CheckCircle, XCircle, Trash2 } from "lucide-react";
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

export function AdminDiscord() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [botStatus, setBotStatus] = useState<DiscordBotStatus | null>(null);
  const [servers, setServers] = useState<DiscordServer[]>([]);
  const [newServerId, setNewServerId] = useState("");
  const [newServerName, setNewServerName] = useState("");
  const [newChannelId, setNewChannelId] = useState("");
  const [newInviteLink, setNewInviteLink] = useState("");
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [discordBotToken, setDiscordBotToken] = useState("");
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
        inviteLink: "https://discord.com/oauth2/authorize?client_id=1495723127357833256&permissions=8&scope=bot",
        duelverseUrl: "https://duelverse.site",
        status: "online",
        servers: [],
      };

      if (data?.value) {
        try {
          const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
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
      inviteLink: botStatus?.inviteLink || "https://discord.com/oauth2/authorize?client_id=1495723127357833256&permissions=8&scope=bot",
      duelverseUrl: botStatus?.duelverseUrl || "https://duelverse.site",
      status: "online",
      servers: newServers,
    };

    const { error: upsertError } = await supabase
      .from("system_settings")
      .upsert({
        key: "discord_bot_status",
        value: JSON.stringify(newStatus),
      }, { onConflict: "key" });

    if (upsertError) {
      throw upsertError;
    }

    setBotStatus(newStatus);
    setServers(newServers);
  };

  const handleToggleServer = async (serverId: string, enabled: boolean) => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const newServers = servers.map(s => 
        s.id === serverId ? { ...s, enabled } : s
      );
      await saveToSupabase(newServers);
      setSuccess(t("admin.discord.serverUpdated"));
    } catch (err) {
      console.error("Erro ao atualizar servidor:", err);
      setError(t("admin.discord.errorUpdating"));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateWebhook = async (serverId: string, channelId: string) => {
    if (!discordBotToken) {
      setError("Bot Token is required to create webhook");
      return null;
    }

    try {
      const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/webhooks`, {
        method: "POST",
        headers: {
          "Authorization": `Bot ${discordBotToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "DuelVerse Bridge",
          avatar: null,
        }),
      });

      if (response.ok) {
        const webhook = await response.json();
        return webhook;
      } else {
        const err = await response.json();
        console.error("Webhook creation error:", err);
        return null;
      }
    } catch (err) {
      console.error("Error creating webhook:", err);
      return null;
    }
  };

  const handleAddServer = async () => {
    if (!newServerId || !newChannelId) {
      setError(t("admin.discord.requireIds"));
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    let webhookUrl = newWebhookUrl;
    let inviteLink = newInviteLink;

    if (!webhookUrl && discordBotToken) {
      const webhook = await handleCreateWebhook(newServerId, newChannelId);
      if (webhook) {
        webhookUrl = `https://discord.com/api/webhooks/${webhook.id}/${webhook.token}`;
      }
    }

    if (!inviteLink) {
      inviteLink = `https://discord.gg/${newChannelId}`;
    }

    try {
      const existingServer = servers.find(s => s.id === newServerId);
      if (existingServer) {
        setError("Servidor já existe");
        setSaving(false);
        return;
      }

      const newServers = [...servers, {
        id: newServerId,
        name: newServerName || `Server ${newServerId}`,
        enabled: true,
        channelId: newChannelId,
        inviteLink,
        webhookUrl,
      }];
      
      await saveToSupabase(newServers);
      setNewServerId("");
      setNewServerName("");
      setNewChannelId("");
      setNewInviteLink("");
      setNewWebhookUrl("");
      setSuccess(t("admin.discord.serverAdded"));
    } catch (err) {
      console.error("Erro ao adicionar servidor:", err);
      setError(t("admin.discord.errorAdding"));
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveServer = async (serverId: string) => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const newServers = servers.filter(s => s.id !== serverId);
      await saveToSupabase(newServers);
      setSuccess(t("admin.discord.serverRemoved"));
    } catch (err) {
      console.error("Erro ao remover servidor:", err);
      setError(t("admin.discord.errorRemoving"));
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSaving(true);
    setError(null);
    try {
      await fetchBotStatus();
      setSuccess(t("admin.discord.syncComplete"));
    } catch {
      setError("Erro ao sincronizar");
    } finally {
      setSaving(false);
    }
  };

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
              {t("admin.discord.title")}
            </CardTitle>
            <CardDescription>
              {t("admin.discord.description")}
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleSync}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            <span className="ml-2">{t("admin.discord.sync")}</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {botStatus && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-muted p-4 rounded-lg">
              <Label className="text-muted-foreground">{t("admin.discord.botStatus")}</Label>
              <div className="flex items-center gap-2 mt-1">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="font-medium capitalize">{botStatus.status}</span>
              </div>
            </div>
            <div className="bg-muted p-4 rounded-lg">
              <Label className="text-muted-foreground">{t("admin.discord.botName")}</Label>
              <p className="font-medium">{botStatus.botName}</p>
            </div>
            <div className="bg-muted p-4 rounded-lg">
              <Label className="text-muted-foreground">{t("admin.discord.inviteLink")}</Label>
              <a 
                href={botStatus.inviteLink} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                {t("admin.discord.openInvite")}
              </a>
            </div>
          </div>
        )}

        <div className="border rounded-lg overflow-hidden">
          <div className="bg-muted px-4 py-3 font-medium flex items-center justify-between">
            <span>{t("admin.discord.servers")}</span>
            <Badge variant="secondary">{servers.length}</Badge>
          </div>
          <div className="divide-y">
            {servers.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                {t("admin.discord.noServers")}
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
                      <p className="text-sm text-muted-foreground">
                        ID: {server.id}
                      </p>
                      {server.channelId && (
                        <p className="text-sm text-muted-foreground">
                          Channel: {server.channelId}
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

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{t("admin.discord.addServer")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted p-3 rounded-lg">
              <Label htmlFor="discordBotToken">Discord Bot Token (to auto-create webhook)</Label>
              <Input
                id="discordBotToken"
                type="password"
                value={discordBotToken}
                onChange={(e) => setDiscordBotToken(e.target.value)}
                placeholder="MTE0OTU3MTI3MzU3ODMzMjU2.G..."
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Required to automatically create webhooks. Get your bot token from Discord Developer Portal.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="serverId">{t("admin.discord.serverId")}</Label>
                <Input
                  id="serverId"
                  value={newServerId}
                  onChange={(e) => setNewServerId(e.target.value)}
                  placeholder="Server ID"
                />
              </div>
              <div>
                <Label htmlFor="serverName">Server Name</Label>
                <Input
                  id="serverName"
                  value={newServerName}
                  onChange={(e) => setNewServerName(e.target.value)}
                  placeholder="My Server"
                />
              </div>
              <div>
                <Label htmlFor="channelId">{t("admin.discord.channelId")}</Label>
                <Input
                  id="channelId"
                  value={newChannelId}
                  onChange={(e) => setNewChannelId(e.target.value)}
                  placeholder="Channel ID"
                />
              </div>
              <div>
                <Label htmlFor="inviteLink">Invite Link</Label>
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
                  onClick={handleAddServer}
                  disabled={saving || !newServerId || !newChannelId}
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  {t("admin.discord.add")}
                </Button>
              </div>
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