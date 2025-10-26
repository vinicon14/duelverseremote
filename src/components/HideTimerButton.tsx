import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";

interface HideTimerButtonProps {
  onToggle: (hidden: boolean) => void;
}

export const HideTimerButton = ({ onToggle }: HideTimerButtonProps) => {
  const [hidden, setHidden] = useState(false);

  const toggle = () => {
    const newState = !hidden;
    setHidden(newState);
    onToggle(newState);
  };

  return (
    <Button
      onClick={toggle}
      variant="outline"
      size="sm"
      className="bg-card/95 backdrop-blur-sm text-xs sm:text-sm"
      title={hidden ? "Mostrar timer" : "Ocultar timer"}
    >
      {hidden ? <EyeOff className="w-3 h-3 sm:w-4 sm:h-4" /> : <Eye className="w-3 h-3 sm:w-4 sm:h-4" />}
    </Button>
  );
};
