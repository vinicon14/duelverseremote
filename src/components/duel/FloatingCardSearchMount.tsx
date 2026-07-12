import { useLocation } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { FloatingCardSearch } from "@/components/duel/FloatingCardSearch";

/**
 * Mounts the FloatingCardSearch only on desktop and only inside match-related routes.
 */
export const FloatingCardSearchMount = () => {
  const isMobile = useIsMobile();
  const location = useLocation();
  if (isMobile) return null;
  const showOn = [
    "/duel/",
    "/duels",
    "/matchmaking",
    "/join/",
    "/m/",
    "/dueling-book-alternativa",
    "/yugioh-omega-alternativa",
    "/yugioh-remote-duel",
    "/pro/duels",
    "/pro/matchmaking",
  ];
  const isVisible = showOn.some((p) => location.pathname.startsWith(p));
  if (!isVisible) return null;
  return <FloatingCardSearch />;
};

export default FloatingCardSearchMount;
