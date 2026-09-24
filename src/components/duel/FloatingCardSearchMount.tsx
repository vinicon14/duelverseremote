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
  // During an actual match (duel room) or a Party room
  const showOn = ["/duel/", "/party/"];
  const isVisible = showOn.some((p) => location.pathname.startsWith(p));
  if (!isVisible) return null;
  return <FloatingCardSearch />;
};

export default FloatingCardSearchMount;
