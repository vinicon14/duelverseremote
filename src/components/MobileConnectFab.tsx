import { Link, useLocation } from "react-router-dom";
import { Smartphone } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * Minimalist mobile-only floating shortcut → "Conectar ao Computador".
 * Compact icon-only button to avoid blocking content like the global chat.
 */
export const MobileConnectFab = () => {
  const isMobile = useIsMobile();
  const location = useLocation();
  if (!isMobile) return null;

  const hideOn = ["/phone-connect", "/phone-camera", "/auth", "/duel/"];
  if (hideOn.some((p) => location.pathname.startsWith(p))) return null;

  return (
    <Link
      to="/phone-connect"
      aria-label="Conectar ao PC"
      title="Conectar ao PC"
      className="fixed bottom-20 right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-background/70 text-foreground/80 backdrop-blur-md shadow-sm transition-colors hover:bg-background/90 hover:text-foreground"
    >
      <Smartphone className="h-4 w-4" />
    </Link>
  );
};

export default MobileConnectFab;
