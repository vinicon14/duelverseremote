import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";

interface HideElementsButtonProps {
  onToggle: (hidden: boolean) => void;
  isHidden?: boolean;
}

export const HideElementsButton = ({ onToggle, isHidden = false }: HideElementsButtonProps) => {
  const handleClick = () => {
    onToggle(!isHidden);
  };

  return (
    <Button
      type="button"
      onClick={handleClick}
      variant="outline"
      size="sm"
      className="bg-card/95 backdrop-blur-sm recording-safe-hide-button"
      data-recording-safe="true"
      title={isHidden ? "Mostrar controles" : "Ocultar controles"}
    >
      {isHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
    </Button>
  );
};
