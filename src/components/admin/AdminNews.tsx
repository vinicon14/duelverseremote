import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit, Upload, X } from "lucide-react";

export const AdminNews = () => {
  const [news, setNews] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editingNews, setEditingNews] = useState<any>(null);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    image_url: ''
  });
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchNews();
  }, []);

  const fetchNews = async () => {
    const { data } = await supabase
      .from('news')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (data) setNews(data);
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
        .from('news-media')
        .upload(filePath, mediaFile, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('news-media')
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
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // Upload da mídia se houver arquivo novo
    const mediaUrl = await uploadMedia();
    if (mediaFile && !mediaUrl) return; // Se tinha arquivo mas falhou upload, cancela

    const newsData = {
      ...formData,
      image_url: mediaUrl || formData.image_url
    };

    if (editingNews) {
      const { error } = await supabase
        .from('news')
        .update(newsData)
        .eq('id', editingNews.id);
      
      if (error) {
        toast({ title: "Erro ao atualizar notícia", variant: "destructive" });
      } else {
        toast({ title: "Notícia atualizada com sucesso!" });
      }
    } else {
      const { error } = await supabase
        .from('news')
        .insert({ ...newsData, author_id: session.user.id });
      
      if (error) {
        toast({ title: "Erro ao criar notícia", variant: "destructive" });
      } else {
        toast({ title: "Notícia criada com sucesso!" });
      }
    }

    setOpen(false);
    setEditingNews(null);
    setFormData({ title: '', content: '', image_url: '' });
    setMediaFile(null);
    setMediaPreview('');
    fetchNews();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta notícia?')) return;
    
    const { error } = await supabase.from('news').delete().eq('id', id);
    
    if (error) {
      toast({ title: "Erro ao excluir notícia", variant: "destructive" });
    } else {
      toast({ title: "Notícia excluída!" });
      fetchNews();
    }
  };

  const openEdit = (item: any) => {
    setEditingNews(item);
    setFormData({
      title: item.title,
      content: item.content,
      image_url: item.image_url || ''
    });
    setMediaPreview(item.image_url || '');
    setMediaFile(null);
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Gerenciar Notícias</h2>
        <Dialog open={open} onOpenChange={(isOpen) => {
          setOpen(isOpen);
          if (!isOpen) {
            setEditingNews(null);
            setFormData({ title: '', content: '', image_url: '' });
            setMediaFile(null);
            setMediaPreview('');
          }
        }}>
          <DialogTrigger asChild>
            <Button className="btn-mystic text-white">
              <Plus className="w-4 h-4 mr-2" />
              Nova Notícia
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingNews ? 'Editar' : 'Criar'} Notícia</DialogTitle>
              <DialogDescription>
                Preencha os campos abaixo para {editingNews ? 'editar' : 'criar'} uma notícia
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
                <Label>Conteúdo</Label>
                <Textarea 
                  value={formData.content}
                  onChange={(e) => setFormData({...formData, content: e.target.value})}
                  rows={6}
                  required
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
              <Button type="submit" className="w-full btn-mystic text-white" disabled={uploading}>
                {uploading ? (
                  <>
                    <Upload className="w-4 h-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>{editingNews ? 'Atualizar' : 'Criar'} Notícia</>
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {news.map((item) => (
          <Card key={item.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {new Date(item.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <div className="flex gap-2">
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
              <p className="text-sm text-muted-foreground line-clamp-2">
                {item.content}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
