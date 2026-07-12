import { Link, useLocation } from "react-router-dom";
import { Smartphone } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";

/**
 * Mobile-only floating shortcut → "Conectar ao Computador".
 * Replaces the removed "Criar Partida"/"Entrar em Partida" flows on mobile.
 */
export const MobileConnectFab = () => {
  const isMobile = useIsMobile();
  const location = useLocation();
  if (!isMobile) return null;

  // Hide on the phone-connect/camera pages themselves and on auth
  const hideOn = ["/phone-connect", "/phone-camera", "/auth"];
  if (hideOn.some((p) => location.pathname.startsWith(p))) return null;

  return (
    <Button
      asChild
      className="fixed bottom-20 right-4 z-40 shadow-lg gap-2 rounded-full"
      size="lg"
    >
      <Link to="/phone-connect">
        <Smartphone className="h-5 w-5" />
        Conectar ao PC
      </Link>
    </Button>
  );
};

export default MobileConnectFab;
