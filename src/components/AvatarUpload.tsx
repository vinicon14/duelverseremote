import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/ui/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Camera, Loader2 } from "lucide-react";

interface AvatarUploadProps {
  userId: string;
  currentAvatarUrl: string | null;
  username: string;
  onAvatarUpdated: (newUrl: string) => void;
}

export const AvatarUpload = ({ userId, currentAvatarUrl, username, onAvatarUpdated }: AvatarUploadProps) => {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resizeImage = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      img.onload = () => {
        const maxSize = 400;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx?.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Erro ao redimensionar imagem'));
        }, file.type, 0.9);
      };

      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0];
      if (!file) return;

      // Validar tipo de arquivo
      if (!file.type.startsWith('image/')) {
        toast({
          title: "Tipo de arquivo inválido",
          description: "Por favor, selecione uma imagem.",
          variant: "destructive",
        });
        return;
      }

      // Validar tamanho (máx 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "Arquivo muito grande",
          description: "O tamanho máximo é 5MB.",
          variant: "destructive",
        });
        return;
      }

      setUploading(true);

      // Redimensionar imagem
      const resizedBlob = await resizeImage(file);

      // Determinar extensão baseada no tipo do arquivo original
      const fileType = file.type;
      let fileExt = 'jpg';
      if (fileType === 'image/png') fileExt = 'png';
      else if (fileType === 'image/jpeg' || fileType === 'image/jpg') fileExt = 'jpg';

      // Nome fixo por tipo: avatar.jpg ou avatar.png
      const fileName = `${userId}/avatar.${fileExt}`;

      // Upload do novo avatar (upsert true vai substituir o arquivo existente)
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, resizedBlob, {
          upsert: true,
          contentType: fileType,
        });

      if (uploadError) throw uploadError;

      // Obter URL pública com timestamp para evitar cache
      const timestamp = new Date().getTime();
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      const urlWithTimestamp = `${publicUrl}?t=${timestamp}`;

      // Atualizar perfil com nova URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: urlWithTimestamp })
        .eq('user_id', userId);

      if (updateError) throw updateError;

      onAvatarUpdated(urlWithTimestamp);

      toast({
        title: "Avatar atualizado!",
        description: "Sua foto de perfil foi atualizada com sucesso.",
      });
    } catch (error: any) {
      console.error('Erro ao fazer upload:', error);
      toast({
        title: "Erro ao atualizar avatar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="relative">
      <Avatar className="w-32 h-32 border-4 border-primary/30">
        <AvatarImage src={currentAvatarUrl || ""} />
        <AvatarFallback className="bg-primary/20 text-4xl">
          {username?.charAt(0).toUpperCase() || "U"}
        </AvatarFallback>
      </Avatar>
      
      <Button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        size="icon"
        className="absolute bottom-0 right-0 rounded-full w-10 h-10 shadow-lg"
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Camera className="h-4 w-4" />
        )}
      </Button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
};
