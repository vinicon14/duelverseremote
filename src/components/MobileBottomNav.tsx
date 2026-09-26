/**
 * DuelVerse - Barra inferior de navegação no celular
 * Acesso rápido às 5 áreas principais.
 */
import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Swords, Trophy, Layers, Store, User } from "lucide-react";
import { useTranslation } from "react-i18next";

const HIDDEN_PREFIXES = ["/duel/", "/duel-room", "/duelroom", "/join-duel", "/party/", "/auth", "/comece", "/go-pro"];

export function MobileBottomNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const hidden = pathname === "/" || HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));

  useEffect(() => {
    document.body.classList.toggle("has-mobile-bottom-nav", !hidden);
    return () => document.body.classList.remove("has-mobile-bottom-nav");
  }, [hidden]);

  if (hidden) return null;

  const items = [
    { to: "/duels", icon: Swords, label: t("nav.duels") },
    { to: "/tournaments", icon: Trophy, label: t("nav.tournaments") },
    { to: "/deck-builder", icon: Layers, label: t("nav.deckShort", "Deck") },
    { to: "/store", icon: Store, label: t("nav.store") },
    { to: "/profile", icon: User, label: t("nav.profile") },
  ];

  return (
    <nav
      aria-label={t("nav.mainMenu", "Menu principal")}
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-5">
        {items.map(({ to, icon: Icon, label }) => {
          const active = pathname === to || pathname.startsWith(to + "/");
          return (
            <li key={to}>
              <Link
                to={to}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 h-14 text-[10px] font-medium ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="truncate max-w-full px-1">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
