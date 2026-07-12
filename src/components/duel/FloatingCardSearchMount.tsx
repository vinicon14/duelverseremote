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
  // Only during an actual match (duel room)
  const showOn = ["/duel/"];
  const isVisible = showOn.some((p) => location.pathname.startsWith(p));
  if (!isVisible) return null;
  return <FloatingCardSearch />;
};

export default FloatingCardSearchMount;
