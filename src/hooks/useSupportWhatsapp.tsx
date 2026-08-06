/**
 * DuelVerse - WhatsApp de suporte
 * Número configurável pelo admin em system_settings (chave: support_whatsapp).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const SUPPORT_WHATSAPP_KEY = "support_whatsapp";

/** Converte um número livre (com máscara) em link wa.me. */
export const buildWhatsappUrl = (raw?: string | null) => {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith("http")) return value;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}`;
};

export const useSupportWhatsapp = () => {
  const [number, setNumber] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("system_settings")
      .select("value")
      .eq("key", SUPPORT_WHATSAPP_KEY)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setNumber(data?.value ?? null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { number, url: buildWhatsappUrl(number), loading };
};
