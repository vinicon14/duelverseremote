/**
 * PropellerAds banner loader.
 * Set VITE_PROPELLERADS_ZONE_ID in the env to activate.
 * Renders nothing when the zone id is missing (default), so no
 * external ad script leaks into the app until the user configures it.
 */
import { useEffect, useRef } from "react";

interface Props {
  className?: string;
  /** Fallback zone id if the env var is not set. */
  zoneId?: string;
}

export const PropellerAdsBanner = ({ className, zoneId }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const zone = (import.meta.env.VITE_PROPELLERADS_ZONE_ID as string | undefined) || zoneId;

  useEffect(() => {
    if (!zone || !containerRef.current) return;
    // PropellerAds "SmartLink" / Banner tag pattern.
    // https://help.propellerads.com/hc/en-us/articles/360019171560
    const script = document.createElement("script");
    script.async = true;
    script.setAttribute("data-cfasync", "false");
    script.src = `//upgulpinon.com/1?z=${encodeURIComponent(zone)}`;
    containerRef.current.appendChild(script);
    const el = containerRef.current;
    return () => {
      el.innerHTML = "";
    };
  }, [zone]);

  if (!zone) return null;
  return <div ref={containerRef} className={className} data-propeller-zone={zone} />;
};

export default PropellerAdsBanner;
