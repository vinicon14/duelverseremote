import { useEffect } from "react";
import { useAccountType } from "@/hooks/useAccountType";

/**
 * ProAdCleaner - Remove ALL ad scripts/elements for PRO users
 * Targets: AdSense, AMP Auto Ads, Monetag, container-* divs
 * Runs cleanup every 2s to catch dynamic injections
 */
export const ProAdCleaner = () => {
  const { isPro, loading } = useAccountType();

  useEffect(() => {
    if (loading || !isPro) return;

    const rootEl = document.getElementById('root');
    
    const isInsideReact = (el: Element) => rootEl?.contains(el);

    const cleanAllAds = () => {
      // Remove ad scripts from <head> only (never touch React tree)
      document.querySelectorAll('head script, body > script').forEach(script => {
        if (isInsideReact(script)) return;
        const src = script.getAttribute('src') || '';
        const text = script.textContent || '';
        if (
          src.includes('adsbygoogle') || src.includes('pagead2.googlesyndication') ||
          src.includes('ampproject.org') || src.includes('monetag') ||
          src.includes('quge5') || src.includes('3nbf4.com') ||
          src.includes('nap5k.com') || src.includes('onclicka') ||
          src.includes('adsterra') || src.includes('popunder') ||
          text.includes('adsbygoogle') || text.includes('monetag') ||
          text.includes('quge5') || text.includes('10601960') || text.includes('10601962')
        ) {
          script.remove();
        }
      });

      // Remove AMP auto ads
      document.querySelectorAll('amp-auto-ads').forEach(el => {
        if (!isInsideReact(el)) el.remove();
      });

      // Remove Monetag container-* divs OUTSIDE React
      document.querySelectorAll('div[id^="container-"]').forEach(el => {
        if (!isInsideReact(el)) el.remove();
      });

      // Remove ad iframes OUTSIDE React (preserve Daily.co)
      document.querySelectorAll('body > iframe, div:not(#root) iframe').forEach(iframe => {
        if (isInsideReact(iframe)) return;
        const src = iframe.getAttribute('src') || '';
        if (src.includes('daily.co') || src.includes('duelverse')) return;
        iframe.remove();
      });

      // Remove ad overlays OUTSIDE React
      document.querySelectorAll('div[id^="google_ads_"], div.google-auto-placed, div[data-google-query-id]').forEach(el => {
        if (!isInsideReact(el)) el.remove();
      });

      // Remove monetag/quge5 divs OUTSIDE React
      document.querySelectorAll('body > div').forEach(el => {
        if (isInsideReact(el)) return;
        const id = el.id || '';
        if (id.includes('monetag') || id.includes('quge5')) el.remove();
      });
    };

    // Immediate cleanup
    cleanAllAds();

    // Aggressive cleanup every 2s
    const interval = setInterval(cleanAllAds, 2000);

    // MutationObserver - only block nodes added OUTSIDE React root
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          const el = node as Element;
          // Never touch nodes inside React root
          if (rootEl?.contains(el)) continue;
          
          const tag = el.tagName;
          
          if (tag === 'SCRIPT') {
            const src = el.getAttribute('src') || '';
            const text = el.textContent || '';
            if (
              src.includes('adsbygoogle') || src.includes('pagead2') ||
              src.includes('monetag') || src.includes('quge5') ||
              src.includes('3nbf4.com') || src.includes('nap5k.com') ||
              src.includes('onclicka') || src.includes('ampproject') ||
              text.includes('adsbygoogle') || text.includes('monetag') ||
              text.includes('quge5')
            ) {
              el.remove();
            }
          }
          
          if (tag === 'IFRAME') {
            const src = el.getAttribute('src') || '';
            if (src.includes('daily.co') || src.includes('duelverse')) continue;
            if (src.includes('monetag') || src.includes('quge5') || src.includes('onclicka')) {
              el.remove();
            }
          }

          if (tag === 'AMP-AUTO-ADS') el.remove();
          if (tag === 'DIV' && el.id.startsWith('container-')) el.remove();
        }
      }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });

    return () => {
      clearInterval(interval);
      observer.disconnect();
    };
  }, [isPro, loading]);

  return null;
};
