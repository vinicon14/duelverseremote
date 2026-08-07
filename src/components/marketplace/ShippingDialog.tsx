/**
 * DuelVerse - Diálogo de dados de entrega
 * Coleta telefone, CEP e endereço completo para produtos físicos.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MapPin, Truck } from "lucide-react";

export interface ShippingInfo {
  phone: string;
  zip: string;
  address: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
}

const emptyShipping: ShippingInfo = {
  phone: "",
  zip: "",
  address: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  state: "",
};

interface ShippingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (info: ShippingInfo) => void;
  submitting?: boolean;
}

export function ShippingDialog({ open, onOpenChange, onConfirm, submitting }: ShippingDialogProps) {
  const [info, setInfo] = useState<ShippingInfo>(emptyShipping);
  const [locating, setLocating] = useState(false);
  const { toast } = useToast();

  const set = (key: keyof ShippingInfo, value: string) => setInfo((prev) => ({ ...prev, [key]: value }));

  const fillFromZip = async (zip: string) => {
    const digits = zip.replace(/\D/g, "");
    if (digits.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (data?.erro) return;
      setInfo((prev) => ({
        ...prev,
        address: data.logradouro || prev.address,
        district: data.bairro || prev.district,
        city: data.localidade || prev.city,
        state: data.uf || prev.state,
      }));
    } catch {
      /* busca de CEP é opcional */
    }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: "Indisponível", description: "Seu dispositivo não suporta geolocalização.", variant: "destructive" });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`
          );
          const data = await res.json();
          const a = data?.address || {};
          setInfo((prev) => ({
            ...prev,
            zip: a.postcode || prev.zip,
            address: a.road || prev.address,
            number: a.house_number || prev.number,
            district: a.suburb || a.neighbourhood || prev.district,
            city: a.city || a.town || a.village || prev.city,
            state: a["ISO3166-2-lvl4"]?.split("-")?.[1] || a.state || prev.state,
          }));
          toast({ title: "Localização preenchida", description: "Confira e complete os dados." });
        } catch {
          toast({ title: "Erro", description: "Não foi possível obter o endereço.", variant: "destructive" });
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        toast({ title: "Permissão negada", description: "Preencha o endereço manualmente.", variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleConfirm = () => {
    const required: (keyof ShippingInfo)[] = ["phone", "zip", "address", "number", "city", "state"];
    const missing = required.filter((k) => !info[k].trim());
    if (missing.length > 0) {
      toast({ title: "Dados incompletos", description: "Preencha telefone, CEP, endereço, número, cidade e estado.", variant: "destructive" });
      return;
    }
    onConfirm(info);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary" />
            Dados de entrega
          </DialogTitle>
          <DialogDescription>Produtos físicos precisam de endereço para envio.</DialogDescription>
        </DialogHeader>

        <Button variant="outline" onClick={useCurrentLocation} disabled={locating} className="w-full">
          {locating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MapPin className="w-4 h-4 mr-2" />}
          Usar localização atual
        </Button>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Telefone *</Label>
            <Input value={info.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(11) 99999-9999" maxLength={20} />
          </div>
          <div className="space-y-1">
            <Label>CEP *</Label>
            <Input
              value={info.zip}
              onChange={(e) => set("zip", e.target.value)}
              onBlur={(e) => fillFromZip(e.target.value)}
              placeholder="00000-000"
              maxLength={9}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>Endereço *</Label>
            <Input value={info.address} onChange={(e) => set("address", e.target.value)} placeholder="Rua / Avenida" maxLength={200} />
          </div>
          <div className="space-y-1">
            <Label>Número *</Label>
            <Input value={info.number} onChange={(e) => set("number", e.target.value)} maxLength={20} />
          </div>
          <div className="space-y-1">
            <Label>Complemento</Label>
            <Input value={info.complement} onChange={(e) => set("complement", e.target.value)} maxLength={100} />
          </div>
          <div className="space-y-1">
            <Label>Bairro</Label>
            <Input value={info.district} onChange={(e) => set("district", e.target.value)} maxLength={100} />
          </div>
          <div className="space-y-1">
            <Label>Cidade *</Label>
            <Input value={info.city} onChange={(e) => set("city", e.target.value)} maxLength={100} />
          </div>
          <div className="space-y-1">
            <Label>Estado *</Label>
            <Input value={info.state} onChange={(e) => set("state", e.target.value)} placeholder="SP" maxLength={40} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="btn-mystic" onClick={handleConfirm} disabled={submitting}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Confirmar compra
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
