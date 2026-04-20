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
import { Loader2, RefreshCw, ExternalLink, Save, Server, CheckCircle, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface DiscordServer {
  id: string;
  name: string;
  enabled: boolean;
  channelId: string;
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
  const [newChannelId, setNewChannelId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchBotStatus();
  }, []);

  const fetchBotStatus = async () => {
    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "discord_bot_status")
        .maybeSingle();

      if (fetchError && fetchError.code !== "PGRST116") {
        console.error("Erro ao buscar status do bot:", fetchError);
      }

      if (data?.value) {
        const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        setBotStatus(parsed);
        setServers(parsed.servers || []);
      }
    } catch (err) {
      console.error("Erro ao buscar status:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleServer = async (serverId: string, enabled: boolean) => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const endpoint = enabled ? "/api/servers/enable" : "/api/servers/disable";
      const body = enabled 
        ? { serverId, channelId: servers.find(s => s.id === serverId)?.channelId }
        : { serverId };

      const response = await fetch(`${import.meta.env.VITE_DISCORD_API_URL || 'http://localhost:8080'}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        setServers(prev => prev.map(s => 
          s.id === serverId ? { ...s, enabled } : s
        ));
        setSuccess(t("admin.discord.serverUpdated"));
      } else {
        setError(t("admin.discord.errorUpdating"));
      }
    } catch (err) {
      setError(t("admin.discord.connectionError"));
    } finally {
      setSaving(false);
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

    try {
      const response = await fetch(`${import.meta.env.VITE_DISCORD_API_URL || 'http://localhost:8080'}/api/servers/enable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverId: newServerId,
          channelId: newChannelId,
        }),
      });

      if (response.ok) {
        setServers(prev => [...prev, {
          id: newServerId,
          name: `Server ${newServerId}`,
          enabled: true,
          channelId: newChannelId,
        }]);
        setNewServerId("");
        setNewChannelId("");
        setSuccess(t("admin.discord.serverAdded"));
      } else {
        setError(t("admin.discord.errorAdding"));
      }
    } catch (err) {
      setError(t("admin.discord.connectionError"));
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveServer = async (serverId: string) => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${import.meta.env.VITE_DISCORD_API_URL || 'http://localhost:8080'}/api/servers/disable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serverId }),
      });

      if (response.ok) {
        setServers(prev => prev.map(s => 
          s.id === serverId ? { ...s, enabled: false } : s
        ));
        setSuccess(t("admin.discord.serverRemoved"));
      } else {
        setError(t("admin.discord.errorRemoving"));
      }
    } catch (err) {
      setError(t("admin.discord.connectionError"));
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSaving(true);
    try {
      await fetchBotStatus();
      setSuccess(t("admin.discord.syncComplete"));
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
                {botStatus.status === "online" ? (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500" />
                )}
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
                      {t("admin.discord.remove")}
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
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="serverId">{t("admin.discord.serverId")}</Label>
                <Input
                  id="serverId"
                  value={newServerId}
                  onChange={(e) => setNewServerId(e.target.value)}
                  placeholder="123456789"
                />
              </div>
              <div>
                <Label htmlFor="channelId">{t("admin.discord.channelId")}</Label>
                <Input
                  id="channelId"
                  value={newChannelId}
                  onChange={(e) => setNewChannelId(e.target.value)}
                  placeholder="123456789"
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