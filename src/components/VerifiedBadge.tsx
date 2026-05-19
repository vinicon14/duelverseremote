import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface VerifiedBadgeProps {
  className?: string;
  size?: number;
  title?: string;
}

export const VerifiedBadge = ({ className, size = 16, title = "Conta verificada" }: VerifiedBadgeProps) => (
  <BadgeCheck
    aria-label={title}
    title={title}
    className={cn("inline-block text-sky-500 fill-sky-500/20", className)}
    style={{ width: size, height: size }}
  />
);
