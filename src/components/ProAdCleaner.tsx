import { useEffect } from "react";
import { useAccountType } from "@/hooks/useAccountType";

/**
 * ProAdCleaner - Remove ALL ad scripts/elements for PRO users
 * Targets: AdSense, AMP Auto Ads, Monetag, container-* divs
 * Runs cleanup every 1s to catch dynamic injections
 */
export const ProAdCleaner = () => {
  const { isPro, loading } = useAccountType();

  useEffect(() => {
    if (loading || !isPro) return;

    const rootEl = document.getElementById('root');
    
    const isInsideReact = (el: Element) => rootEl?.contains(el);

    const AD_SRC_PATTERNS = [
      'adsbygoogle', 'pagead2.googlesyndication', 'ampproject.org',
      'monetag', 'quge5', '3nbf4.com', 'nap5k.com', 'onclicka',
      'adsterra', 'popunder', 'al5sm.com', 'popcash', 'propellerads',
      'vignette', 'tag.min.js'
    ];

    const AD_TEXT_PATTERNS = [
      'adsbygoogle', 'monetag', 'quge5', '10601960', '10601962',
      'zone=1060', 'nap5k', '3nbf4'
    ];

    const matchesAdPattern = (src: string, text: string) => {
      const srcLower = src.toLowerCase();
      const textLower = text.toLowerCase();
      return AD_SRC_PATTERNS.some(p => srcLower.includes(p)) ||
             AD_TEXT_PATTERNS.some(p => textLower.includes(p));
    };

    const cleanAllAds = () => {
      // Remove ad scripts (never touch React tree)
      document.querySelectorAll('head script, body > script').forEach(script => {
        if (isInsideReact(script)) return;
        const src = script.getAttribute('src') || '';
        const text = script.textContent || '';
        if (matchesAdPattern(src, text)) script.remove();
      });

      // Remove AMP auto ads
      document.querySelectorAll('amp-auto-ads').forEach(el => {
        if (!isInsideReact(el)) el.remove();
      });

      // Remove container-* divs OUTSIDE React
      document.querySelectorAll('div[id^="container-"]').forEach(el => {
        if (!isInsideReact(el)) el.remove();
      });

      // Remove ad iframes OUTSIDE React (preserve Daily.co)
      document.querySelectorAll('iframe').forEach(iframe => {
        if (isInsideReact(iframe)) return;
        const src = iframe.getAttribute('src') || '';
        if (src.includes('daily.co') || src.includes('duelverse')) return;
        // Remove ALL non-app iframes for PRO users
        if (
          !src || src.includes('monetag') || src.includes('quge5') ||
          src.includes('onclicka') || src.includes('3nbf4') ||
          src.includes('nap5k') || src.includes('adsterra') ||
          src.includes('vignette') || src.includes('al5sm')
        ) {
          iframe.remove();
        }
      });

      // Remove ad overlays OUTSIDE React
      document.querySelectorAll('div[id^="google_ads_"], div.google-auto-placed, div[data-google-query-id]').forEach(el => {
        if (!isInsideReact(el)) el.remove();
      });

      // Remove any fixed/overlay elements with extremely high z-index OUTSIDE React
      document.querySelectorAll('body > div, body > section, body > aside').forEach(el => {
        if (isInsideReact(el)) return;
        const id = el.id || '';
        const style = (el as HTMLElement).style;
        const computedZIndex = parseInt(style.zIndex || '0', 10);
        
        if (id.includes('monetag') || id.includes('quge5')) {
          el.remove();
          return;
        }
        
        // Remove suspicious high z-index overlays outside React
        if (
          (style.position === 'fixed' || style.position === 'absolute') &&
          computedZIndex > 99999
        ) {
          el.remove();
        }
      });

      // Remove elements with Monetag-related data attributes
      document.querySelectorAll('[data-quge5], [data-monetag], [data-popunder], [data-onclicka]').forEach(el => {
        if (!isInsideReact(el)) el.remove();
      });
    };

    // Immediate cleanup
    cleanAllAds();

    // Aggressive cleanup every 500ms
    const interval = setInterval(cleanAllAds, 500);

    // MutationObserver - block nodes added OUTSIDE React root
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          const el = node as Element;
          if (rootEl?.contains(el)) continue;
          
          const tag = el.tagName;
          
          if (tag === 'SCRIPT') {
            const src = el.getAttribute('src') || '';
            const text = el.textContent || '';
            if (matchesAdPattern(src, text)) {
              el.remove();
            }
          }
          
          if (tag === 'IFRAME') {
            const src = el.getAttribute('src') || '';
            if (src.includes('daily.co') || src.includes('duelverse')) continue;
            // For PRO: remove any non-app iframe injected outside React
            el.remove();
          }

          if (tag === 'AMP-AUTO-ADS') el.remove();
          if (tag === 'DIV' && (el as HTMLElement).id?.startsWith('container-')) el.remove();
        }
      }
    });

    observer.observe(document.documentElement, { childList: true, subtree: true });

    // Also block window.open for PRO users
    const originalOpen = window.open;
    window.open = function(...args: Parameters<typeof window.open>): Window | null {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.toString() || '';
      if (AD_SRC_PATTERNS.some(p => url.includes(p)) || url.includes('pop') || url.includes('click')) {
        return null;
      }
      return originalOpen.apply(window, args);
    };

    return () => {
      clearInterval(interval);
      observer.disconnect();
      window.open = originalOpen;
    };
  }, [isPro, loading]);

  return null;
};
