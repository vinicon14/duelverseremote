import { Button } from "@/components/ui/button";
import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";

interface HideElementsButtonProps {
  onToggle: () => void;
  isHidden: boolean;
}

export const HideElementsButton = ({ onToggle, isHidden }: HideElementsButtonProps) => {
  const { t } = useTranslation();
  return (
    <Button
      type="button"
      onClick={onToggle}
      variant="outline"
      size="sm"
      className="bg-card/95 backdrop-blur-sm recording-safe-hide-button"
      data-recording-safe="true"
      title={isHidden ? t('hideElements.show') : t('hideElements.hide')}
    >
      {isHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
    </Button>
  );
};
