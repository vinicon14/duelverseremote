/**
 * Espaço de anúncio: mostra um anúncio próprio da plataforma para o local
 * escolhido; se não houver, usa o banner do Google AdSense (se ativo).
 * Nunca aparece para PRO, landing pages, login ou salas de duelo.
 */
import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { useAccountType } from "@/hooks/useAccountType";
import { useSiteAds, type AdPlacement } from "@/hooks/useSiteAds";
import { GoogleAd } from "@/components/GoogleAd";
import { cn } from "@/lib/utils";

const isBlockedPath = (pathname: string) => {
  const path = pathname.replace(/\/+$/, "") || "/";
  return (
    path === "/" ||
    path === "/auth" ||
    path === "/landing" ||
    path === "/comece" ||
    /^\/[a-z]{2}(-[A-Za-z]{2})?$/.test(path) ||
    path.includes("duelverse-yugioh-duelos-online") ||
    path.startsWith("/duel") ||
    path.includes("/join-duel") ||
    path.startsWith("/party/")
  );
};

interface Props {
  placement: Exclude<AdPlacement, "popup">;
  className?: string;
  /** Usado para variar o anúncio próprio entre vários espaços na mesma página. */
  seed?: number;
  /** Ignora o bloqueio por rota (ex.: landing e página de duelos, liberadas pelo dono). PRO continua sem anúncios. */
  force?: boolean;
}

export const SiteAdSlot = ({ placement, className, seed = 0, force = false }: Props) => {
  const { isPro, loading } = useAccountType();
  const { pathname } = useLocation();
  const config = useSiteAds();

  const ownAd = useMemo(() => {
    const list = config?.ownAds.filter((a) => a.placement === placement) || [];
    if (!list.length) return null;
    const base = Math.floor(Date.now() / (1000 * 60 * 10)); // gira a cada 10 min
    return list[(base + seed) % list.length];
  }, [config, placement, seed]);

  if (loading || isPro || !config || isBlockedPath(pathname)) return null;

  if (ownAd) {
    const isVideo = !!ownAd.image_url && /\.(mp4|webm)(\?|$)/i.test(ownAd.image_url);
    const Wrapper: any = ownAd.link_url ? "a" : "div";
    const wrapperProps = ownAd.link_url
      ? { href: ownAd.link_url, target: "_blank", rel: "noopener noreferrer sponsored" }
      : {};
    return (
      <aside aria-label="Anúncio" className={cn("w-full", className)}>
        <Wrapper
          {...wrapperProps}
          className={cn(
            "group relative flex items-center gap-3 sm:gap-4 overflow-hidden rounded-xl border border-border bg-card/80 backdrop-blur-sm transition-colors",
            ownAd.link_url && "hover:border-primary/50",
            placement === "top" ? "p-2.5 sm:p-3" : "flex-col items-stretch p-0 h-full",
          )}
        >
          {ownAd.image_url && (
            isVideo ? (
              <video src={ownAd.image_url} autoPlay muted loop playsInline
                className={placement === "top" ? "h-14 w-24 sm:h-16 sm:w-28 rounded-lg object-cover shrink-0" : "aspect-square w-full object-cover"} />
            ) : (
              <img src={ownAd.image_url} alt={ownAd.title} loading="lazy"
                className={placement === "top" ? "h-14 w-24 sm:h-16 sm:w-28 rounded-lg object-cover shrink-0" : "aspect-square w-full object-cover"} />
            )
          )}
          <div className={cn("min-w-0 flex-1", placement === "inline" && "p-3")}>
            <p className="font-semibold text-sm sm:text-base line-clamp-1">{ownAd.title}</p>
            {ownAd.content && <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">{ownAd.content}</p>}
          </div>
          {ownAd.link_url && placement === "top" && (
            <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0" />
          )}
          <span className="absolute top-1 right-1.5 text-[9px] uppercase tracking-wider text-muted-foreground/70">Patrocinado</span>
        </Wrapper>
      </aside>
    );
  }

  const slot = placement === "top" ? config.slotTop : config.slotInline;
  if (!config.adsenseEnabled || !slot) return null;

  return (
    <aside aria-label="Anúncio" className={cn("w-full overflow-hidden", className)}>
      <GoogleAd
        slot={slot}
        client={config.adsenseClient}
        format={placement === "top" ? "horizontal" : "rectangle"}
        style={{ display: "block", minHeight: placement === "top" ? 90 : 250 }}
      />
    </aside>
  );
};

export default SiteAdSlot;
