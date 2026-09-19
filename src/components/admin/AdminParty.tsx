/**
 * DuelVerse - Gerenciamento de salas Party (Admin)
 * Lista salas abertas/fechadas, filtra por idioma e permite excluir.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, PartyPopper, RefreshCw, Trash2, Users, Lock, Search } from "lucide-react";
import { toast } from "sonner";
import { SUPPORTED_LANGUAGES } from "@/i18n/countries";

interface AdminPartyRoom {
  id: string;
  name: string;
  description: string | null;
  language_code: string;
  tcg_type: string | null;
  host_id: string;
  host_username: string | null;
  is_private: boolean;
  is_active: boolean;
  created_at: string;
  closed_at: string | null;
  participants: number;
}

const langInfo = (code: string) =>
  SUPPORTED_LANGUAGES.find((l) => l.code === code) ?? { code, name: code, flag: "🌐" };

export function AdminParty() {
  const [rooms, setRooms] = useState<AdminPartyRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeClosed, setIncludeClosed] = useState(false);
  const [language, setLanguage] = useState("all");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase.rpc as any)("admin_party_rooms", {
      p_include_closed: includeClosed,
    });
    if (error) {
      toast.error("Não foi possível carregar as salas Party");
      setRooms([]);
    } else {
      setRooms(((data ?? []) as any[]).map((r) => ({ ...r, participants: Number(r.participants) })));
    }
    setLoading(false);
  }, [includeClosed]);

  useEffect(() => {
    load();
  }, [load]);

  const byLanguage = useMemo(() => {
    const map = new Map<string, number>();
    rooms.forEach((r) => map.set(r.language_code, (map.get(r.language_code) ?? 0) + 1));
    return map;
  }, [rooms]);

  const visible = rooms.filter(
    (r) =>
      (language === "all" || r.language_code === language) &&
      (query.trim() === "" ||
        r.name.toLowerCase().includes(query.trim().toLowerCase()) ||
        (r.host_username ?? "").toLowerCase().includes(query.trim().toLowerCase()))
  );

  const removeRoom = async (room: AdminPartyRoom) => {
    if (!confirm(`Excluir a sala "${room.name}"?`)) return;
    const { error } = await supabase.rpc("delete_party_room", { _room_id: room.id });
    if (error) {
      toast.error("Não foi possível excluir a sala");
      return;
    }
    toast.success("Sala excluída");
    load();
  };

  const cleanup = async () => {
    const { error } = await supabase.rpc("cleanup_empty_party_rooms");
    if (error) {
      toast.error("Não foi possível limpar as salas vazias");
      return;
    }
    toast.success("Salas vazias há mais de 3 minutos foram removidas");
    load();
  };

  const onlinePeople = rooms.reduce((sum, r) => sum + (r.is_active ? r.participants : 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Salas listadas</p>
            <p className="text-2xl font-bold text-primary">{rooms.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Ativas</p>
            <p className="text-2xl font-bold text-primary">{rooms.filter((r) => r.is_active).length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Pessoas nas salas</p>
            <p className="text-2xl font-bold text-primary">{onlinePeople}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Idiomas ativos</p>
            <p className="text-2xl font-bold text-primary">{byLanguage.size}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por sala ou criador..."
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="party-closed" checked={includeClosed} onCheckedChange={setIncludeClosed} />
          <Label htmlFor="party-closed" className="text-sm">Incluir encerradas</Label>
        </div>
        <Button variant="outline" size="sm" onClick={cleanup}>
          Limpar salas vazias
        </Button>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Button
          size="sm"
          variant={language === "all" ? "default" : "outline"}
          className="shrink-0"
          onClick={() => setLanguage("all")}
        >
          🌐 Todos ({rooms.length})
        </Button>
        {[...byLanguage.entries()].map(([code, count]) => (
          <Button
            key={code}
            size="sm"
            variant={language === code ? "default" : "outline"}
            className="shrink-0"
            onClick={() => setLanguage(code)}
          >
            {langInfo(code).flag} {langInfo(code).name} ({count})
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14">
            <PartyPopper className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">Nenhuma sala Party encontrada.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((room) => (
            <Card key={room.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    {room.name}
                    {room.is_private && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                  </CardTitle>
                  <Button variant="destructive" size="sm" onClick={() => removeRoom(room)}>
                    <Trash2 className="mr-2 h-4 w-4" /> Excluir
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {room.description && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{room.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant={room.is_active ? "secondary" : "outline"}>
                    {room.is_active ? "Ativa" : "Encerrada"}
                  </Badge>
                  <Badge variant="outline">
                    {langInfo(room.language_code).flag} {langInfo(room.language_code).name}
                  </Badge>
                  {room.tcg_type && <Badge variant="outline">{room.tcg_type.toUpperCase()}</Badge>}
                  <Badge variant="secondary" className="gap-1">
                    <Users className="h-3 w-3" /> {room.participants}
                  </Badge>
                  <span className="text-muted-foreground">
                    por {room.host_username ?? "Jogador"} ·{" "}
                    {new Date(room.created_at).toLocaleString("pt-BR")}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
