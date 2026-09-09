/**
 * DuelVerse - Loja de produtos físicos (pagamento em dinheiro)
 * Produtos oficiais pagos em R$ via Mercado Pago (Pix, cartão, boleto),
 * com coleta de CEP, endereço completo e telefone para entrega.
 */
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MapPin, Package, ShoppingBag, Truck, Minus, Plus } from "lucide-react";

interface PhysicalProduct {
  id: string;
  name: string;
  description: string | null;
  price_brl: number | null;
  image_url: string | null;
  stock: number | null;
}

interface ShippingForm {
  name: string;
  phone: string;
  zip: string;
  address: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
}

const emptyForm: ShippingForm = {
  name: "",
  phone: "",
  zip: "",
  address: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  state: "",
};

const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PhysicalStore() {
  const [products, setProducts] = useState<PhysicalProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PhysicalProduct | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [form, setForm] = useState<ShippingForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [lookingZip, setLookingZip] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("marketplace_products")
      .select("id, name, description, price_brl, image_url, stock")
      .eq("is_active", true)
      .eq("payment_type", "money")
      .eq("is_approved", true)
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Erro", description: "Não foi possível carregar os produtos.", variant: "destructive" });
    } else {
      setProducts((data as PhysicalProduct[]) || []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (key: keyof ShippingForm, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const fillFromZip = async (zip: string) => {
    const digits = zip.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setLookingZip(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (data?.erro) return;
      setForm((prev) => ({
        ...prev,
        address: data.logradouro || prev.address,
        district: data.bairro || prev.district,
        city: data.localidade || prev.city,
        state: data.uf || prev.state,
      }));
    } catch {
      /* busca de CEP é opcional */
    } finally {
      setLookingZip(false);
    }
  };

  const openCheckout = (product: PhysicalProduct) => {
    setSelected(product);
    setQuantity(1);
    setForm(emptyForm);
  };

  const handlePay = async () => {
    if (!selected) return;
    const required: (keyof ShippingForm)[] = ["name", "phone", "zip", "address", "number", "city", "state"];
    if (required.some((k) => !form[k].trim())) {
      toast({
        title: "Dados incompletos",
        description: "Preencha nome, telefone, CEP, endereço, número, cidade e estado.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({ title: "Entre na sua conta", description: "Você precisa estar logado para comprar.", variant: "destructive" });
        return;
      }

      const { data, error } = await supabase.functions.invoke("marketplace-create-payment", {
        body: {
          product_id: selected.id,
          quantity,
          origin_url: window.location.origin,
          shipping: form,
        },
      });

      if (error) throw error;
      const result = data as { checkout_url?: string; error?: string };
      if (!result?.checkout_url) throw new Error(result?.error || "Falha ao iniciar o pagamento");

      window.location.href = result.checkout_url;
    } catch (err: any) {
      toast({ title: "Erro", description: err.message || "Falha ao iniciar o pagamento", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <ShoppingBag className="w-16 h-16 mb-4 opacity-30" />
        <p className="text-lg">Nenhum produto físico disponível no momento.</p>
      </div>
    );
  }

  const unit = Number(selected?.price_brl || 0);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-6">
        {products.map((product) => {
          const soldOut = product.stock !== null && product.stock <= 0;
          return (
            <Card key={product.id} className="group bg-card border-border hover:border-primary/40 transition-all overflow-hidden">
              <div className="aspect-square relative overflow-hidden bg-muted">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-10 h-10 sm:w-16 sm:h-16 text-muted-foreground/30" />
                  </div>
                )}
                <Badge className="absolute top-2 left-2 bg-primary/20 text-primary border-0 gap-1 text-[10px] sm:text-xs">
                  <Truck className="w-3 h-3" /> Entrega
                </Badge>
                {soldOut && (
                  <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                    <span className="text-xl font-bold text-destructive">Esgotado</span>
                  </div>
                )}
              </div>

              <CardHeader className="p-2 sm:p-4 pb-1 sm:pb-2">
                <CardTitle className="text-sm sm:text-lg line-clamp-1">{product.name}</CardTitle>
              </CardHeader>

              {product.description && (
                <CardContent className="px-2 sm:px-4 py-0">
                  <p className="text-xs text-muted-foreground line-clamp-2">{product.description}</p>
                </CardContent>
              )}

              <CardFooter className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-2 sm:p-4 pt-2 gap-1.5 sm:gap-0">
                <span className="font-bold text-sm sm:text-lg text-primary">{brl(Number(product.price_brl || 0))}</span>
                <Button
                  size="sm"
                  className="btn-mystic h-8 sm:h-9 text-xs sm:text-sm w-full sm:w-auto"
                  disabled={soldOut}
                  onClick={() => openCheckout(product)}
                >
                  Comprar
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-primary" />
              Finalizar compra
            </DialogTitle>
            <DialogDescription>
              Informe os dados de entrega. O pagamento é feito por Pix, cartão ou boleto.
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{selected.name}</p>
                  <p className="text-xs text-muted-foreground">{brl(unit)} por unidade</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
                    <Minus className="w-3.5 h-3.5" />
                  </Button>
                  <span className="w-6 text-center font-medium">{quantity}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setQuantity((q) => Math.min(selected.stock ?? 10, q + 1))}
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <Label>Nome completo *</Label>
                  <Input value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={120} />
                </div>
                <div className="space-y-1">
                  <Label>Telefone *</Label>
                  <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(11) 99999-9999" maxLength={20} />
                </div>
                <div className="space-y-1">
                  <Label className="flex items-center gap-1">
                    CEP * {lookingZip && <Loader2 className="w-3 h-3 animate-spin" />}
                  </Label>
                  <Input
                    value={form.zip}
                    onChange={(e) => set("zip", e.target.value)}
                    onBlur={(e) => fillFromZip(e.target.value)}
                    placeholder="00000-000"
                    maxLength={9}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Endereço *</Label>
                  <Input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Rua / Avenida" maxLength={200} />
                </div>
                <div className="space-y-1">
                  <Label>Número *</Label>
                  <Input value={form.number} onChange={(e) => set("number", e.target.value)} maxLength={20} />
                </div>
                <div className="space-y-1">
                  <Label>Complemento</Label>
                  <Input value={form.complement} onChange={(e) => set("complement", e.target.value)} maxLength={100} />
                </div>
                <div className="space-y-1">
                  <Label>Bairro</Label>
                  <Input value={form.district} onChange={(e) => set("district", e.target.value)} maxLength={100} />
                </div>
                <div className="space-y-1">
                  <Label>Cidade *</Label>
                  <Input value={form.city} onChange={(e) => set("city", e.target.value)} maxLength={100} />
                </div>
                <div className="space-y-1">
                  <Label>Estado *</Label>
                  <Input value={form.state} onChange={(e) => set("state", e.target.value)} placeholder="SP" maxLength={40} />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="w-4 h-4" /> Total
                </span>
                <span className="text-lg font-bold text-primary">{brl(unit * quantity)}</span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Cancelar</Button>
            <Button className="btn-mystic" onClick={handlePay} disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Ir para o pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
