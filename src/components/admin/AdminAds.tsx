import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit, Eye, EyeOff, Upload, X } from "lucide-react";

export const AdminAds = () => {
  const [ads, setAds] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editingAd, setEditingAd] = useState<any>(null);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    image_url: '',
    link_url: '',
    is_active: true,
    expires_at: ''
  });
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchAds();
  }, []);

  const fetchAds = async () => {
    const { data } = await supabase
      .from('advertisements')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (data) setAds(data);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setMediaFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setMediaPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadMedia = async (): Promise<string | null> => {
    if (!mediaFile) return formData.image_url;

    setUploading(true);
    try {
      const fileExt = mediaFile.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError, data } = await supabase.storage
        .from('ads-media')
        .upload(filePath, mediaFile, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('ads-media')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error: any) {
      toast({ 
        title: "Erro ao fazer upload", 
        description: error.message,
        variant: "destructive" 
      });
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Upload da mídia se houver arquivo novo
    const mediaUrl = await uploadMedia();
    if (mediaFile && !mediaUrl) return; // Se tinha arquivo mas falhou upload, cancela

    const adData = {
      ...formData,
      image_url: mediaUrl || formData.image_url,
      expires_at: formData.expires_at || null
    };

    if (editingAd) {
      const { error } = await supabase
        .from('advertisements')
        .update(adData)
        .eq('id', editingAd.id);
      
      if (error) {
        toast({ title: "Erro ao atualizar anúncio", variant: "destructive" });
      } else {
        toast({ title: "Anúncio atualizado com sucesso!" });
      }
    } else {
      const { error } = await supabase
        .from('advertisements')
        .insert(adData);
      
      if (error) {
        toast({ title: "Erro ao criar anúncio", variant: "destructive" });
      } else {
        toast({ title: "Anúncio criado com sucesso!" });
      }
    }

    setOpen(false);
    setEditingAd(null);
    setFormData({ title: '', content: '', image_url: '', link_url: '', is_active: true, expires_at: '' });
    setMediaFile(null);
    setMediaPreview('');
    fetchAds();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir este anúncio?')) return;
    
    const { error } = await supabase.from('advertisements').delete().eq('id', id);
    
    if (error) {
      toast({ title: "Erro ao excluir anúncio", variant: "destructive" });
    } else {
      toast({ title: "Anúncio excluído!" });
      fetchAds();
    }
  };

  const openEdit = (item: any) => {
    setEditingAd(item);
    setFormData({
      title: item.title,
      content: item.content || '',
      image_url: item.image_url || '',
      link_url: item.link_url || '',
      is_active: item.is_active,
      expires_at: item.expires_at ? item.expires_at.split('T')[0] : ''
    });
    setMediaPreview(item.image_url || '');
    setMediaFile(null);
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Gerenciar Anúncios</h2>
        <Dialog open={open} onOpenChange={(isOpen) => {
          setOpen(isOpen);
          if (!isOpen) {
            setEditingAd(null);
            setFormData({ title: '', content: '', image_url: '', link_url: '', is_active: true, expires_at: '' });
            setMediaFile(null);
            setMediaPreview('');
          }
        }}>
          <DialogTrigger asChild>
            <Button className="btn-mystic text-white">
              <Plus className="w-4 h-4 mr-2" />
              Novo Anúncio
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingAd ? 'Editar' : 'Criar'} Anúncio</DialogTitle>
              <DialogDescription>
                Preencha os campos abaixo para {editingAd ? 'editar' : 'criar'} um anúncio
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Título</Label>
                <Input 
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  required
                />
              </div>
              <div>
                <Label>Descrição</Label>
                <Input 
                  value={formData.content}
                  onChange={(e) => setFormData({...formData, content: e.target.value})}
                  required
                  placeholder="Breve descrição do anúncio"
                />
              </div>
              <div>
                <Label>Imagem ou Vídeo</Label>
                <div className="space-y-3">
                  <Input 
                    type="file"
                    accept="image/*,video/*"
                    onChange={handleFileChange}
                    className="cursor-pointer"
                  />
                  {mediaPreview && (
                    <div className="relative rounded-lg overflow-hidden border">
                      {mediaPreview.startsWith('data:video') || formData.image_url?.includes('.mp4') || formData.image_url?.includes('.webm') ? (
                        <video src={mediaPreview || formData.image_url} controls className="w-full h-48 object-cover" />
                      ) : (
                        <img src={mediaPreview || formData.image_url} alt="Preview" className="w-full h-48 object-cover" />
                      )}
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2"
                        onClick={() => {
                          setMediaFile(null);
                          setMediaPreview('');
                          setFormData({...formData, image_url: ''});
                        }}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Formatos aceitos: JPG, PNG, WEBP, GIF, MP4, WEBM (máx. 50MB)
                  </p>
                </div>
              </div>
              <div>
                <Label>URL do Link</Label>
                <Input 
                  type="url"
                  value={formData.link_url}
                  onChange={(e) => setFormData({...formData, link_url: e.target.value})}
                  required
                />
              </div>
              <div>
                <Label>Data de Expiração (opcional)</Label>
                <Input 
                  type="date"
                  value={formData.expires_at}
                  onChange={(e) => setFormData({...formData, expires_at: e.target.value})}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch 
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({...formData, is_active: checked})}
                />
                <Label>Ativo</Label>
              </div>
              <Button type="submit" className="w-full btn-mystic text-white" disabled={uploading}>
                {uploading ? (
                  <>
                    <Upload className="w-4 h-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>{editingAd ? 'Atualizar' : 'Criar'} Anúncio</>
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {ads.map((item) => (
          <Card key={item.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {item.expires_at ? `Expira em: ${new Date(item.expires_at).toLocaleDateString('pt-BR')}` : 'Sem expiração'}
                  </p>
                </div>
                <div className="flex gap-2">
                  {item.is_active ? (
                    <Eye className="w-5 h-5 text-green-500" />
                  ) : (
                    <EyeOff className="w-5 h-5 text-muted-foreground" />
                  )}
                  <Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {item.image_url && (
                <div className="mb-3 rounded-lg overflow-hidden">
                  {item.image_url.includes('.mp4') || item.image_url.includes('.webm') ? (
                    <video src={item.image_url} controls className="w-full h-32 object-cover" />
                  ) : (
                    <img src={item.image_url} alt={item.title} className="w-full h-32 object-cover" />
                  )}
                </div>
              )}
              {item.content && (
                <p className="text-sm text-muted-foreground mb-2">
                  {item.content}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Link: {item.link_url}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
