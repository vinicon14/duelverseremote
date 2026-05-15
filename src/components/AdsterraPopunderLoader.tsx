import { useEffect } from "react";
import { useAccountType } from "@/hooks/useAccountType";

/**
 * AdsterraPopunderLoader - Injeta o popunder da Adsterra
 * para usuários não-PRO em duelverse.site.
 */
const ADSTERRA_POPUNDER_SRC =
  "https://pl29453418.profitablecpmratenetwork.com/dd/21/2d/dd212dc20d13c1f222d6ecc204774eaf.js";
const SCRIPT_ID = "adsterra-popunder-29352919";

export const AdsterraPopunderLoader = (): null => {
  const { isPro, loading } = useAccountType();

  useEffect(() => {
    if (loading) return;
    if (isPro) {
      document.getElementById(SCRIPT_ID)?.remove();
      return;
    }
    if (document.getElementById(SCRIPT_ID)) return;

    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = ADSTERRA_POPUNDER_SRC;
    s.async = true;
    document.body.appendChild(s);
  }, [isPro, loading]);

  return null;
};
