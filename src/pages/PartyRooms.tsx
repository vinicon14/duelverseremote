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
import { Loader2, PartyPopper, Plus, Lock, Users } from "lucide-react";
import { toast } from "sonner";
import { useBanCheck } from "@/hooks/useBanCheck";
import { useTcg } from "@/contexts/TcgContext";

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
  const [form, setForm] = useState({ name: "", description: "", isPrivate: false, password: "" });
  const [joinPassword, setJoinPassword] = useState<Record<string, string>>({});

  const fetchRooms = useCallback(async () => {
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
        language_code: localStorage.getItem("userLanguage") || "pt-BR",
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
    navigate(`/party/${room.id}`);
  };

  return (
    <div className="min-h-screen bg-transparent">
      <Navbar />
      <main className="container mx-auto px-4 pt-24 pb-12">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <PartyPopper className="h-7 w-7 text-primary" />
              <h1 className="text-3xl font-bold gradient-text">Modo Party</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Salas abertas, sem limite de pessoas. Todos podem ligar câmera e microfone.
            </p>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="btn-mystic">
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

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : rooms.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <PartyPopper className="mb-4 h-14 w-14 text-muted-foreground" />
              <p className="text-muted-foreground">Nenhuma sala Party aberta agora. Crie a primeira!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room) => (
              <Card key={room.id} className="card-mystic">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="truncate text-lg">{room.name}</CardTitle>
                    {room.is_private && <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  </div>
                  <CardDescription className="truncate">por {room.hostName}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {room.description && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">{room.description}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="gap-1">
                      <Users className="h-3 w-3" /> {room.participants ?? 0} na sala
                    </Badge>
                    <Badge variant="outline">{room.language_code}</Badge>
                  </div>
                  {room.is_private && room.host_id !== userId && (
                    <Input
                      placeholder="Senha da sala"
                      value={joinPassword[room.id] ?? ""}
                      onChange={(e) => setJoinPassword({ ...joinPassword, [room.id]: e.target.value })}
                    />
                  )}
                  <Button className="w-full btn-mystic" onClick={() => enterRoom(room)}>
                    Entrar
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
