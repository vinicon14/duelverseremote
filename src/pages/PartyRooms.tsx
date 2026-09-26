/**
 * DuelVerse - Modo Party
 * Lista e criação de salas abertas, sem limite de participantes.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, PartyPopper, Plus, Lock, Users, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useBanCheck } from "@/hooks/useBanCheck";
import { useTcg } from "@/contexts/TcgContext";
import { SUPPORTED_LANGUAGES } from "@/i18n/countries";

const langInfo = (code: string) =>
  SUPPORTED_LANGUAGES.find((l) => l.code === code) ?? { code, name: code, flag: "🌐" };

const defaultLanguage = () => localStorage.getItem("userLanguage") || "pt-BR";

interface PartyRoomRow {
  id: string;
  name: string;
  description: string | null;
  language_code: string;
  tcg_type: string | null;
  host_id: string;
  is_private: boolean;
  created_at: string;
  hostName?: string;
  participants?: number;
}

export default function PartyRooms() {
  useBanCheck();
  const navigate = useNavigate();
  const { activeTcg } = useTcg();
  const [rooms, setRooms] = useState<PartyRoomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    isPrivate: false,
    password: "",
    language: defaultLanguage(),
  });
  const [joinPassword, setJoinPassword] = useState<Record<string, string>>({});
  const [languageFilter, setLanguageFilter] = useState<string>(defaultLanguage());

  const visibleRooms =
    languageFilter === "all" ? rooms : rooms.filter((r) => r.language_code === languageFilter);

  const fetchRooms = useCallback(async () => {
    // Remove salas vazias há mais de 3 minutos antes de listar
    await supabase.rpc("cleanup_empty_party_rooms");

    const { data, error } = await supabase
      .from("party_rooms")
      .select("id, name, description, language_code, tcg_type, host_id, is_private, created_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) {
      setLoading(false);
      return;
    }

    const list = (data ?? []) as PartyRoomRow[];
    if (list.length > 0) {
      const hostIds = [...new Set(list.map((r) => r.host_id))];
      const [{ data: profiles }, { data: participants }] = await Promise.all([
        supabase.from("profiles").select("user_id, username").in("user_id", hostIds),
        supabase
          .from("party_participants")
          .select("room_id")
          .is("left_at", null)
          .in("room_id", list.map((r) => r.id)),
      ]);
      list.forEach((room) => {
        room.hostName = profiles?.find((p: any) => p.user_id === room.host_id)?.username ?? "Jogador";
        room.participants = (participants ?? []).filter((p: any) => p.room_id === room.id).length;
      });
    }
    setRooms(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }
      setUserId(session.user.id);
      fetchRooms();
    };
    init();
  }, [fetchRooms, navigate]);

  useEffect(() => {
    const channel = supabase
      .channel("party-rooms-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "party_rooms" }, () => fetchRooms())
      .on("postgres_changes", { event: "*", schema: "public", table: "party_participants" }, () => fetchRooms())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchRooms]);

  const createRoom = async () => {
    if (!userId) return;
    if (!form.name.trim()) {
      toast.error("Dê um nome para a sala");
      return;
    }
    if (form.isPrivate && !form.password.trim()) {
      toast.error("Defina uma senha para a sala privada");
      return;
    }
    setCreating(true);
    const { data, error } = await supabase
      .from("party_rooms")
      .insert({
        name: form.name.trim(),
        description: form.description.trim() || null,
        language_code: form.language,
        tcg_type: activeTcg,
        host_id: userId,
        is_private: form.isPrivate,
        password: form.isPrivate ? form.password.trim() : null,
      })
      .select("id")
      .single();
    setCreating(false);
    if (error || !data) {
      toast.error("Não foi possível criar a sala");
      return;
    }
    setOpen(false);
    navigate(`/party/${data.id}`);
  };

  const deleteRoom = async (room: PartyRoomRow) => {
    if (!confirm(`Excluir a sala "${room.name}"?`)) return;
    const { error } = await supabase.rpc("delete_party_room", { _room_id: room.id });
    if (error) {
      toast.error("Não foi possível excluir a sala");
      return;
    }
    toast.success("Sala excluída");
    fetchRooms();
  };

  const enterRoom = async (room: PartyRoomRow) => {
    if (room.is_private && room.host_id !== userId) {
      const typed = joinPassword[room.id] ?? "";
      const { data } = await supabase
        .from("party_rooms")
        .select("id")
        .eq("id", room.id)
        .eq("password", typed)
        .maybeSingle();
      if (!data) {
        toast.error("Senha incorreta");
        return;
      }
    }
    navigate(`/party/${room.id}`, { state: { verified: true } });
  };

  return (
    <div className="min-h-screen bg-transparent">
      <Navbar />
      <main className="container mx-auto px-3 sm:px-4 pt-20 sm:pt-24 pb-12">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <PartyPopper className="h-7 w-7 text-primary" />
              <h1 className="text-2xl sm:text-3xl font-bold gradient-text">Modo Party</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl leading-relaxed">
              Salas abertas, sem limite de pessoas. Todos podem ligar câmera e microfone.
            </p>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="btn-mystic w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4" /> Criar sala Party
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova sala Party</DialogTitle>
                <DialogDescription>Sem apostas, sem pontuação — só conversa e diversão.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="party-name">Nome da sala</Label>
                  <Input
                    id="party-name"
                    value={form.name}
                    maxLength={60}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ex.: Resenha dos duelistas"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="party-desc">Descrição (opcional)</Label>
                  <Textarea
                    id="party-desc"
                    value={form.description}
                    maxLength={200}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Idioma da sala</Label>
                  <Select
                    value={form.language}
                    onValueChange={(v) => setForm({ ...form, language: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_LANGUAGES.map((l) => (
                        <SelectItem key={l.code} value={l.code}>
                          {l.flag} {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Sala privada</p>
                    <p className="text-xs text-muted-foreground">Exige senha para entrar</p>
                  </div>
                  <Switch
                    checked={form.isPrivate}
                    onCheckedChange={(v) => setForm({ ...form, isPrivate: v })}
                  />
                </div>
                {form.isPrivate && (
                  <div className="space-y-2">
                    <Label htmlFor="party-pass">Senha</Label>
                    <Input
                      id="party-pass"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                    />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button onClick={createRoom} disabled={creating} className="btn-mystic w-full">
                  {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Criar e entrar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="scrollbar-none -mx-3 mb-5 flex snap-x gap-2 overflow-x-auto px-3 pb-2 sm:mx-0 sm:px-0">
          <Button
            size="sm"
            variant={languageFilter === "all" ? "default" : "outline"}
            className="shrink-0 snap-start"
            onClick={() => setLanguageFilter("all")}
          >
            🌐 Todos ({rooms.length})
          </Button>
          {SUPPORTED_LANGUAGES.map((l) => {
            const count = rooms.filter((r) => r.language_code === l.code).length;
            if (count === 0 && languageFilter !== l.code) return null;
            return (
              <Button
                key={l.code}
                size="sm"
                variant={languageFilter === l.code ? "default" : "outline"}
                className="shrink-0 snap-start"
                onClick={() => setLanguageFilter(l.code)}
              >
                {l.flag} {l.name} ({count})
              </Button>
            );
          })}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : visibleRooms.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center gap-3 py-16">
              <PartyPopper className="h-14 w-14 text-muted-foreground" />
              <p className="text-muted-foreground">
                {rooms.length === 0
                  ? "Nenhuma sala Party aberta agora. Crie a primeira!"
                  : `Nenhuma sala em ${langInfo(languageFilter).name}. Crie a primeira!`}
              </p>
              {rooms.length > 0 && languageFilter !== "all" && (
                <Button variant="outline" size="sm" onClick={() => setLanguageFilter("all")}>
                  Ver salas de todos os idiomas
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
            {visibleRooms.map((room) => (
              <Card key={room.id} className="card-mystic border-border/80">
                <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="truncate text-lg">{room.name}</CardTitle>
                    {room.is_private && <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  </div>
                  <CardDescription className="truncate">por {room.hostName}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 p-4 pt-2 sm:p-6 sm:pt-3">
                  {room.description && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{room.description}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="gap-1">
                      <Users className="h-3 w-3" /> {room.participants ?? 0} na sala
                    </Badge>
                    <Badge variant="outline">
                      {langInfo(room.language_code).flag} {langInfo(room.language_code).name}
                    </Badge>
                  </div>
                  {room.is_private && room.host_id !== userId && (
                    <Input
                      placeholder="Senha da sala"
                      value={joinPassword[room.id] ?? ""}
                      onChange={(e) => setJoinPassword({ ...joinPassword, [room.id]: e.target.value })}
                    />
                  )}
                  <div className="flex gap-2">
                     <Button className="flex-1 min-h-11 btn-mystic" onClick={() => enterRoom(room)}>
                      Entrar
                    </Button>
                    {room.host_id === userId && (
                      <Button
                        variant="destructive"
                        size="icon"
                        aria-label="Excluir sala"
                        onClick={() => deleteRoom(room)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
