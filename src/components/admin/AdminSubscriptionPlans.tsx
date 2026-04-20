import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit2, Save, X, Crown, Upload, Image as ImageIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

interface SubscriptionPlan {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price_duelcoins: number;
  duration_days: number;
  duration_type: "weekly" | "monthly" | "yearly";
  is_active: boolean;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
}

export const AdminSubscriptionPlans = () => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    image_url: "",
    price_duelcoins: 0,
    duration_days: 30,
    duration_type: "monthly" as "weekly" | "monthly" | "yearly",
    is_active: true,
    is_featured: false,
  });

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("subscription_plans")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPlans((data as SubscriptionPlan[]) || []);
    } catch (error) {
      console.error("Error fetching plans:", error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      image_url: "",
      price_duelcoins: 0,
      duration_days: 30,
      duration_type: "monthly",
      is_active: true,
      is_featured: false,
    });
    setImageFile(null);
    setImagePreview("");
    setEditingPlan(null);
  };

  const handleOpenDialog = (plan?: SubscriptionPlan) => {
    if (plan) {
      setEditingPlan(plan);
      setFormData({
        name: plan.name,
        description: plan.description || "",
        image_url: plan.image_url || "",
        price_duelcoins: plan.price_duelcoins,
        duration_days: plan.duration_days,
        duration_type: plan.duration_type,
        is_active: plan.is_active,
        is_featured: plan.is_featured,
      });
      setImagePreview(plan.image_url || "");
    } else {
      resetForm();
    }
    setIsDialogOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile) return formData.image_url || null;

    setUploading(true);
    try {
      const fileExt = imageFile.name.split(".").pop();
      const fileName = `plan-${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError, data } = await supabase.storage
        .from("plan-images")
        .upload(filePath, imageFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("plan-images").getPublicUrl(filePath);

      return publicUrl;
    } catch (error: any) {
      toast({
        title: "Erro ao fazer upload",
        description: error.message,
        variant: "destructive",
      });
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    try {
      const imageUrl = await uploadImage();
      if (imageFile && !imageUrl) return;

      if (editingPlan) {
        const { error } = await (supabase as any)
          .from("subscription_plans")
          .update({
            name: formData.name,
            description: formData.description || null,
            image_url: imageUrl || formData.image_url || null,
            price_duelcoins: formData.price_duelcoins,
            duration_days: formData.duration_days,
            duration_type: formData.duration_type,
            is_active: formData.is_active,
            is_featured: formData.is_featured,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingPlan.id);

        if (error) throw error;
        toast({ title: "Plano atualizado com sucesso!" });
      } else {
        const { error } = await (supabase as any)
          .from("subscription_plans")
          .insert({
            name: formData.name,
            description: formData.description || null,
            image_url: imageUrl || null,
            price_duelcoins: formData.price_duelcoins,
            duration_days: formData.duration_days,
            duration_type: formData.duration_type,
            is_active: formData.is_active,
            is_featured: formData.is_featured,
          });

        if (error) throw error;
        toast({ title: "Plano criado com sucesso!" });
      }

      setIsDialogOpen(false);
      resetForm();
      fetchPlans();
    } catch (error: any) {
      console.error("Error saving plan:", error);
      toast({
        title: "Erro ao salvar plano",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (planId: string) => {
    if (!confirm("Tem certeza que deseja excluir este plano?")) return;

    try {
      const { error } = await (supabase as any)
        .from("subscription_plans")
        .delete()
        .eq("id", planId);

      if (error) throw error;
      toast({ title: "Plano excluído com sucesso!" });
      fetchPlans();
    } catch (error: any) {
      console.error("Error deleting plan:", error);
      toast({
        title: "Erro ao excluir plano",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const toggleActive = async (plan: SubscriptionPlan) => {
    try {
      const { error } = await (supabase as any)
        .from("subscription_plans")
        .update({ is_active: !plan.is_active, updated_at: new Date().toISOString() })
        .eq("id", plan.id);

      if (error) throw error;
      fetchPlans();
    } catch (error: any) {
      console.error("Error toggling plan:", error);
      toast({
        title: "Erro ao atualizar plano",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getDurationLabel = (type: string, days: number) => {
    switch (type) {
      case "weekly":
        return `${days} dias (Semanal)`;
      case "monthly":
        return `${days} dias (Mensal)`;
      case "yearly":
        return `${days} dias (Anual)`;
      default:
        return `${days} dias`;
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  if (loading) {
    return <div>Carregando planos...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h2 className="text-2xl font-bold">Planos de Assinatura</h2>
          <p className="text-muted-foreground">
            Gerencie os planos disponíveis para compra com DuelCoins
          </p>
        </div>
        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()} className="btn-mystic">
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Plano
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingPlan ? "Editar Plano" : "Adicionar Novo Plano"}
              </DialogTitle>
              <DialogDescription>
                Configure os detalhes do plano de assinatura
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Imagem do Plano</Label>
                <div className="flex flex-col items-center justify-center border-2 border-dashed border rounded-lg p-4">
                  {imagePreview ? (
                    <div className="relative w-full">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="w-full h-40 object-contain rounded-md"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="absolute top-2 right-2"
                        onClick={removeImage}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center">
                      <ImageIcon className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground mb-2">
                        Clique ou arraste uma imagem
                      </p>
                    </div>
                  )}
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                    id="plan-image"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="mt-2"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    {uploading ? "Enviando..." : "Selecionar Imagem"}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Nome do Plano</Label>
                <Input
                  id="name"
                  placeholder="Ex: Plano Pro Mensal"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  placeholder="Descrição do plano..."
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price">Preço (DuelCoins)</Label>
                  <Input
                    id="price"
                    type="number"
                    min="0"
                    value={formData.price_duelcoins}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        price_duelcoins: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="duration_days">Duração (dias)</Label>
                  <Input
                    id="duration_days"
                    type="number"
                    min="1"
                    value={formData.duration_days}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        duration_days: parseInt(e.target.value) || 1,
                      })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Tipo de Duração</Label>
                <Select
                  value={formData.duration_type}
                  onValueChange={(value: "weekly" | "monthly" | "yearly") =>
                    setFormData({ ...formData, duration_type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Semanal</SelectItem>
                    <SelectItem value="monthly">Mensal</SelectItem>
                    <SelectItem value="yearly">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Label>Plano Ativo</Label>
                  <Switch
                    checked={formData.is_active}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, is_active: checked })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Plano em Destaque</Label>
                  <Switch
                    checked={formData.is_featured}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, is_featured: checked })
                    }
                  />
                </div>
              </div>

              <Button
                onClick={handleSave}
                className="w-full btn-mystic"
                disabled={uploading}
              >
                <Save className="w-4 h-4 mr-2" />
                {uploading ? "Salvando..." : editingPlan ? "Salvar Alterações" : "Criar Plano"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {plans.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Crown className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              Nenhum plano de assinatura encontrado.
            </p>
            <p className="text-sm text-muted-foreground">
              Clique em "Adicionar Plano" para criar o primeiro.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto pb-4 -mx-4 px-4">
          <div className="flex gap-4 md:grid-cols-2 lg:grid-cols-3" style={{ minWidth: 'max-content' }}>
            {plans.map((plan) => (
            <Card key={plan.id} className={!plan.is_active ? "opacity-60" : ""}>
              {plan.is_featured && (
                <div className="bg-primary text-primary-foreground text-center py-1 text-sm font-medium">
                  Destaque
                </div>
              )}
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle className="flex items-center gap-2">
                    <Crown className="w-5 h-5 text-yellow-500" />
                    {plan.name}
                  </CardTitle>
                  <Badge variant={plan.is_active ? "default" : "secondary"}>
                    {plan.is_active ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
                {plan.image_url && (
                  <img
                    src={plan.image_url}
                    alt={plan.name}
                    className="w-full h-32 object-cover rounded-md mt-2"
                  />
                )}
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-2xl font-bold text-primary">
                      {plan.price_duelcoins}
                    </p>
                    <p className="text-sm text-muted-foreground">DuelCoins</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">
                      {getDurationLabel(plan.duration_type, plan.duration_days)}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleOpenDialog(plan)}
                  >
                    <Edit2 className="w-4 h-4 mr-1" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleActive(plan)}
                  >
                    {plan.is_active ? "Desativar" : "Ativar"}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(plan.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          </div>
        </div>
      )}
    </div>
  );
};
