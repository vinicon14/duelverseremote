import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit, Eye, EyeOff } from "lucide-react";

export const AdminNews = () => {
  const [news, setNews] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editingNews, setEditingNews] = useState<any>(null);
  const [formData, setFormData] = useState({
    title: '',
    summary: '',
    content: '',
    image_url: '',
    published: false
  });
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    if (editingNews) {
      const { error } = await supabase
        .from('news')
        .update(formData)
        .eq('id', editingNews.id);
      
      if (error) {
        toast({ title: "Erro ao atualizar notícia", variant: "destructive" });
      } else {
        toast({ title: "Notícia atualizada com sucesso!" });
      }
    } else {
      const { error } = await supabase
        .from('news')
        .insert({ ...formData, author_id: session.user.id });
      
      if (error) {
        toast({ title: "Erro ao criar notícia", variant: "destructive" });
      } else {
        toast({ title: "Notícia criada com sucesso!" });
      }
    }

    setOpen(false);
    setEditingNews(null);
    setFormData({ title: '', summary: '', content: '', image_url: '', published: false });
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
      summary: item.summary || '',
      content: item.content,
      image_url: item.image_url || '',
      published: item.published
    });
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
            setFormData({ title: '', summary: '', content: '', image_url: '', published: false });
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
                <Label>Resumo</Label>
                <Input 
                  value={formData.summary}
                  onChange={(e) => setFormData({...formData, summary: e.target.value})}
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
                <Label>URL da Imagem</Label>
                <Input 
                  type="url"
                  value={formData.image_url}
                  onChange={(e) => setFormData({...formData, image_url: e.target.value})}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch 
                  checked={formData.published}
                  onCheckedChange={(checked) => setFormData({...formData, published: checked})}
                />
                <Label>Publicada</Label>
              </div>
              <Button type="submit" className="w-full btn-mystic text-white">
                {editingNews ? 'Atualizar' : 'Criar'} Notícia
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
                  {item.published ? (
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
              <p className="text-sm text-muted-foreground line-clamp-2">
                {item.summary || item.content}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
