/**
 * DuelVerse - Enviar vídeo do aparelho para a galeria (até 100MB)
 */
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const MAX_BYTES = 100 * 1024 * 1024;

export function UploadVideoDialog({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [saving, setSaving] = useState(false);

  const pick = (f: File | null) => {
    if (!f) return setFile(null);
    if (!f.type.startsWith("video/")) {
      toast.error(t("gallery.upload.notVideo", "Escolha um arquivo de vídeo"));
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error(t("gallery.upload.tooBig", "O vídeo passa de 100MB"));
      return;
    }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").slice(0, 120));
  };

  const submit = async () => {
    if (!file) return toast.error(t("gallery.upload.chooseFile", "Escolha um vídeo"));
    if (!title.trim()) return toast.error(t("gallery.upload.needTitle", "Dê um título ao vídeo"));
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("auth");
      const ext = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${session.user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("match-recordings")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("match-recordings").getPublicUrl(path);
      const { error } = await supabase.from("match_recordings").insert({
        user_id: session.user.id,
        title: title.trim(),
        description: description.trim() || null,
        video_url: publicUrl,
        file_size: file.size,
        is_public: isPublic,
      });
      if (error) throw error;
      toast.success(t("gallery.upload.success", "Vídeo enviado para a galeria"));
      setOpen(false);
      setFile(null); setTitle(""); setDescription("");
      onCreated();
    } catch (e) {
      console.error(e);
      toast.error(t("gallery.upload.error", "Não foi possível enviar o vídeo"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && setOpen(o)}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Upload className="h-4 w-4" /> {t("gallery.upload.button", "Enviar vídeo")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("gallery.upload.button", "Enviar vídeo")}</DialogTitle>
          <DialogDescription>{t("gallery.upload.hint", "Vídeos do seu aparelho, até 100MB.")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="up-file">{t("gallery.upload.file", "Arquivo")}</Label>
            <Input id="up-file" type="file" accept="video/*" onChange={(e) => pick(e.target.files?.[0] || null)} />
            {file && <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="up-title">{t("gallery.upload.title", "Título")}</Label>
            <Input id="up-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="up-desc">{t("gallery.upload.description", "Descrição (opcional)")}</Label>
            <Textarea id="up-desc" value={description} maxLength={400} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <p className="text-sm font-medium">{t("gallery.upload.public", "Público")}</p>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </div>
          {saving && <Progress value={undefined} className="h-1 animate-pulse" />}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={saving || !file} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? t("gallery.upload.sending", "Enviando...") : t("gallery.upload.send", "Enviar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
