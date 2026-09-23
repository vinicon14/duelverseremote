import { useEffect, useRef } from "react";
import { useAccountType } from "@/hooks/useAccountType";
import { DEFAULT_ADSENSE_CLIENT } from "@/hooks/useSiteAds";

declare global {
  interface Window {
    adsbygoogle: any[];
    _adsenseLoaded?: string;
  }
}

interface GoogleAdProps {
  slot: string;
  client?: string;
  format?: "auto" | "fluid" | "rectangle" | "vertical" | "horizontal";
  style?: React.CSSProperties;
  className?: string;
}

const loadAdSenseScript = (client: string) => {
  if (window._adsenseLoaded) return;
  window._adsenseLoaded = client;
  const script = document.createElement("script");
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
  script.async = true;
  script.crossOrigin = "anonymous";
  document.head.appendChild(script);
};

export const GoogleAd = ({
  slot,
  client = DEFAULT_ADSENSE_CLIENT,
  format = "auto",
  style = { display: "block" },
  className = "",
}: GoogleAdProps) => {
  const { isPro } = useAccountType();
  const adRef = useRef<HTMLDivElement>(null);
  const pushed = useRef(false);

  useEffect(() => {
    if (isPro) return;
    loadAdSenseScript(client);
    const timer = setTimeout(() => {
      try {
        if (!pushed.current && adRef.current) {
          const ins = adRef.current.querySelector("ins.adsbygoogle");
          if (ins && !ins.getAttribute("data-ad-status")) {
            (window.adsbygoogle = window.adsbygoogle || []).push({});
            pushed.current = true;
          }
        }
      } catch {
        // ignora erros de anúncio
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [isPro, client]);

  if (isPro) return null;

  return (
    <div ref={adRef} className={`google-ad-container ${className}`}>
      <ins
        className="adsbygoogle"
        style={style}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  );
};
