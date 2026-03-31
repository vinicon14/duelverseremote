import { useEffect, useRef } from "react";
import { useAccountType } from "@/hooks/useAccountType";

declare global {
  interface Window {
    adsbygoogle: any[];
    _adsenseLoaded?: boolean;
  }
}

interface GoogleAdProps {
  slot: string;
  format?: "auto" | "fluid" | "rectangle" | "vertical" | "horizontal";
  style?: React.CSSProperties;
  className?: string;
}

const loadAdSenseScript = () => {
  if (window._adsenseLoaded) return;
  window._adsenseLoaded = true;

  const script = document.createElement('script');
  script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5741796577623184';
  script.async = true;
  script.crossOrigin = 'anonymous';
  document.head.appendChild(script);
};

export const GoogleAd = ({ 
  slot, 
  format = "auto", 
  style = { display: "block" },
  className = ""
}: GoogleAdProps) => {
  const { isPro } = useAccountType();
  const adRef = useRef<HTMLDivElement>(null);
  const pushed = useRef(false);

  useEffect(() => {
    if (isPro) return;

    // Load AdSense script dynamically (only for FREE users)
    loadAdSenseScript();

    const timer = setTimeout(() => {
      try {
        if (!pushed.current && adRef.current) {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
          pushed.current = true;
        }
      } catch (error) {
        console.error("Error loading Google Ad:", error);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [isPro]);

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
