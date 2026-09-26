/**
 * DuelVerse - Convite discreto para virar PRO
 * Aparece para contas FREE logadas, no máximo a cada 3 dias.
 */
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Crown, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAccountType } from "@/hooks/useAccountType";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const KEY = "dv_pro_upsell_dismissed_at";
const INTERVAL = 3 * 24 * 60 * 60 * 1000;
const SHOW_ON = ["/duels", "/tournaments", "/store", "/gallery", "/ranking", "/deck-builder", "/profile", "/my-items"];

export function ProUpsellBanner() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { isPro, loading } = useAccountType();
  const [logged, setLogged] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    const at = Number(localStorage.getItem(KEY) || 0);
    return Date.now() - at < INTERVAL;
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setLogged(!!data.session));
  }, []);

  if (loading || isPro || !logged || dismissed) return null;
  if (!SHOW_ON.some((p) => pathname.startsWith(p))) return null;

  const close = () => {
    localStorage.setItem(KEY, String(Date.now()));
    setDismissed(true);
  };

  return (
    <div className="fixed inset-x-2 bottom-[4.5rem] md:bottom-4 md:left-auto md:right-4 md:max-w-sm z-40 rounded-xl border border-primary/30 bg-card/95 p-3 shadow-lg">
      <div className="flex items-start gap-3">
        <Crown className="h-5 w-5 shrink-0 text-primary mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{t("pro.upsellTitle", "Jogue sem anúncios com o PRO")}</p>
          <p className="text-xs text-muted-foreground">{t("pro.upsellText", "Veja os planos e ative na hora.")}</p>
          <Button asChild size="sm" className="mt-2 h-8" onClick={close}>
            <Link to="/go-pro">{t("pro.upsellCta", "Ver planos PRO")}</Link>
          </Button>
        </div>
        <button onClick={close} aria-label={t("common.close", "Fechar")} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
