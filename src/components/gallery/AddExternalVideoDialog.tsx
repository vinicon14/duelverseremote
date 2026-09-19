/**
 * DuelVerse - Publicar vídeo externo na galeria
 */
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PLATFORM_LABEL, parseExternalVideoUrl } from "@/utils/externalVideo";

export function AddExternalVideoDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [link, setLink] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);

  const parsed = useMemo(() => parseExternalVideoUrl(link), [link]);

  const submit = async () => {
    if (!parsed) {
      toast.error("Link não suportado. Use YouTube, Twitch, Vimeo, TikTok ou Kick.");
      return;
    }
    if (!title.trim()) {
      toast.error("Dê um título ao vídeo");
      return;
    }
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setSaving(false);
      toast.error("Faça login para publicar");
      return;
    }
    const { error } = await supabase.from("match_recordings").insert({
      user_id: session.user.id,
      title: title.trim(),
      description: description.trim() || null,
      video_url: parsed.url,
      thumbnail_url: parsed.thumbnailUrl,
      is_public: isPublic,
      source_platform: parsed.platform,
      external_video_id: parsed.videoId,
    });
    setSaving(false);
    if (error) {
      toast.error("Não foi possível publicar o vídeo");
      return;
    }
    toast.success("Vídeo publicado na galeria");
    setOpen(false);
    setLink("");
    setTitle("");
    setDescription("");
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Link2 className="h-4 w-4" /> Adicionar vídeo externo
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar vídeo externo</DialogTitle>
          <DialogDescription>YouTube, Twitch, Vimeo, TikTok ou Kick.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ext-link">Link do vídeo</Label>
            <Input
              id="ext-link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
            />
            {link && (
              <p className={`text-xs ${parsed ? "text-primary" : "text-destructive"}`}>
                {parsed ? `Detectado: ${PLATFORM_LABEL[parsed.platform]}` : "Link inválido ou não suportado"}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ext-title">Título</Label>
            <Input id="ext-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ext-desc">Descrição (opcional)</Label>
            <Textarea
              id="ext-desc"
              value={description}
              maxLength={400}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Público</p>
              <p className="text-xs text-muted-foreground">Todos podem assistir na galeria</p>
            </div>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </div>
        </div>
        <DialogFooter>
          <Button className="w-full btn-mystic" onClick={submit} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Publicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
