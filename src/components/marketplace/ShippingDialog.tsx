/**
 * DuelVerse - Diálogo de dados de entrega
 * Coleta telefone, CEP e endereço completo para produtos físicos.
 * Todos os textos usam o sistema de i18n (namespace `shipping`).
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();

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
      toast({ title: t("shipping.unavailable"), description: t("shipping.unavailableDesc"), variant: "destructive" });
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
          toast({ title: t("shipping.filled"), description: t("shipping.filledDesc") });
        } catch {
          toast({ title: t("orders.error"), description: t("shipping.locError"), variant: "destructive" });
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        toast({ title: t("shipping.denied"), description: t("shipping.deniedDesc"), variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleConfirm = () => {
    const required: (keyof ShippingInfo)[] = ["phone", "zip", "address", "number", "city", "state"];
    const missing = required.filter((k) => !info[k].trim());
    if (missing.length > 0) {
      toast({ title: t("shipping.incomplete"), description: t("shipping.incompleteDesc"), variant: "destructive" });
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
            {t("shipping.title")}
          </DialogTitle>
          <DialogDescription>{t("shipping.desc")}</DialogDescription>
        </DialogHeader>

        <Button variant="outline" onClick={useCurrentLocation} disabled={locating} className="w-full">
          {locating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MapPin className="w-4 h-4 mr-2" />}
          {t("shipping.useLocation")}
        </Button>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>{t("shipping.phone")} *</Label>
            <Input value={info.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(11) 99999-9999" maxLength={20} />
          </div>
          <div className="space-y-1">
            <Label>{t("shipping.zip")} *</Label>
            <Input
              value={info.zip}
              onChange={(e) => set("zip", e.target.value)}
              onBlur={(e) => fillFromZip(e.target.value)}
              placeholder="00000-000"
              maxLength={9}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label>{t("shipping.address")} *</Label>
            <Input value={info.address} onChange={(e) => set("address", e.target.value)} maxLength={200} />
          </div>
          <div className="space-y-1">
            <Label>{t("shipping.number")} *</Label>
            <Input value={info.number} onChange={(e) => set("number", e.target.value)} maxLength={20} />
          </div>
          <div className="space-y-1">
            <Label>{t("shipping.complement")}</Label>
            <Input value={info.complement} onChange={(e) => set("complement", e.target.value)} maxLength={100} />
          </div>
          <div className="space-y-1">
            <Label>{t("shipping.district")}</Label>
            <Input value={info.district} onChange={(e) => set("district", e.target.value)} maxLength={100} />
          </div>
          <div className="space-y-1">
            <Label>{t("shipping.city")} *</Label>
            <Input value={info.city} onChange={(e) => set("city", e.target.value)} maxLength={100} />
          </div>
          <div className="space-y-1">
            <Label>{t("shipping.state")} *</Label>
            <Input value={info.state} onChange={(e) => set("state", e.target.value)} maxLength={40} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("shipping.cancel")}</Button>
          <Button className="btn-mystic" onClick={handleConfirm} disabled={submitting}>
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t("shipping.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
