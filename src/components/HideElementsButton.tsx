import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";

interface HideElementsButtonProps {
  onToggle: (hidden: boolean) => void;
}

export const HideElementsButton = ({ onToggle }: HideElementsButtonProps) => {
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
      className="bg-card/95 backdrop-blur-sm"
      title={hidden ? "Mostrar controles" : "Ocultar controles"}
    >
      {hidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
    </Button>
  );
};
