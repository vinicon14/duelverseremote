import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload, Image, Loader2 } from "lucide-react";

interface DecklistUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournamentId: string;
  onUploaded: () => void;
}

export const DecklistUploadModal = ({
  open,
  onOpenChange,
  tournamentId,
  onUploaded,
}: DecklistUploadModalProps) => {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!selected.type.startsWith("image/")) {
      toast({ title: "Selecione uma imagem", variant: "destructive" });
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      toast({ title: "Imagem muito grande (máx 5MB)", variant: "destructive" });
      return;
    }

    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const ext = file.name.split(".").pop();
      const path = `${user.id}/${tournamentId}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("tournament-decklists")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("tournament-decklists")
        .getPublicUrl(path);

      // Save reference in tournament_decklists table
      const { error: dbError } = await (supabase as any)
        .from("tournament_decklists")
        .upsert({
          tournament_id: tournamentId,
          user_id: user.id,
          image_url: urlData.publicUrl,
        }, { onConflict: "tournament_id,user_id" });

      if (dbError) throw dbError;

      toast({ title: "Decklist enviada com sucesso!" });
      onUploaded();
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: "Erro ao enviar decklist",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Image className="w-5 h-5" />
            Enviar Decklist
          </DialogTitle>
          <DialogDescription>
            Este torneio exige o envio de uma imagem da sua decklist para participar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {preview ? (
            <div className="relative">
              <img
                src={preview}
                alt="Decklist preview"
                className="w-full max-h-64 object-contain rounded-lg border"
              />
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => {
                  setPreview(null);
                  setFile(null);
                }}
              >
                Trocar
              </Button>
            </div>
          ) : (
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                Clique para selecionar a imagem da decklist
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PNG, JPG ou WEBP (máx 5MB)
              </p>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />

          <Button
            className="w-full btn-mystic text-white"
            disabled={!file || uploading}
            onClick={handleUpload}
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Enviar e Inscrever-se
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
