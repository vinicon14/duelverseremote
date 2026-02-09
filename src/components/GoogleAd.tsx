import { useEffect, useRef } from "react";
import { useAccountType } from "@/hooks/useAccountType";

// Declaração de tipo para Google AdSense
declare global {
  interface Window {
    adsbygoogle: any[];
  }
}

interface GoogleAdProps {
  slot: string;
  format?: "auto" | "fluid" | "rectangle" | "vertical" | "horizontal";
  style?: React.CSSProperties;
  className?: string;
}

export const GoogleAd = ({ 
  slot, 
  format = "auto", 
  style = { display: "block" },
  className = ""
}: GoogleAdProps) => {
  const { isPro } = useAccountType();
  const adRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Não exibir anúncios para usuários PRO
    if (isPro) return;

    try {
      if (window.adsbygoogle && adRef.current) {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      }
    } catch (error) {
      console.error("Error loading Google Ad:", error);
    }
  }, [isPro]);

  // Não renderizar nada para usuários PRO
  if (isPro) return null;

  return (
    <div ref={adRef} className={`google-ad-container ${className}`}>
      <ins
        className="adsbygoogle"
        style={style}
        data-ad-client="ca-pub-5741796577623184"
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  );
};
