import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";

/**
 * País do usuário (perfil). Se o perfil não tiver país, usamos o idioma
 * como pista (pt-BR -> BR). Retorna null enquanto carrega.
 */
export const useUserCountry = () => {
  const { i18n } = useTranslation();
  const [country, setCountry] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        let code: string | null = null;
        if (session?.user) {
          const { data } = await supabase
            .from("profiles")
            .select("country_code")
            .eq("user_id", session.user.id)
            .maybeSingle();
          code = (data as any)?.country_code ?? null;
        }
        if (!code) {
          const lang = i18n.language || "";
          if (lang === "pt-BR") code = "BR";
        }
        if (!cancelled) setCountry(code);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [i18n.language]);

  return { country, loading, isBrazil: country === "BR" };
};
