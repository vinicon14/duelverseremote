import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Smartphone } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { PhonePairModal } from "./PhonePairModal";

/**
 * Floating "Conectar celular" launcher.
 * Desktop only. Visible on duel-related pages so the user can pair before or during a match.
 */
export const PhonePairFab = () => {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const location = useLocation();

  if (isMobile) return null;

  const showOn = ["/duel/", "/duels", "/matchmaking", "/join/", "/m/"];
  const isVisible = showOn.some((p) => location.pathname.startsWith(p));
  if (!isVisible) return null;

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 shadow-lg gap-2"
        size="lg"
        variant="secondary"
        title="Conectar celular como câmera"
      >
        <Smartphone className="h-4 w-4" />
        Conectar celular
      </Button>
      <PhonePairModal open={open} onOpenChange={setOpen} />
    </>
  );
};

export default PhonePairFab;
