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

    const cleanAllAds = () => {
      // Remove AdSense scripts
      document.querySelectorAll('script').forEach(script => {
        const src = script.getAttribute('src') || '';
        const text = script.textContent || '';
        if (
          src.includes('adsbygoogle') ||
          src.includes('pagead2.googlesyndication') ||
          src.includes('amp-auto-ads') ||
          src.includes('ampproject.org') ||
          src.includes('monetag') ||
          src.includes('quge5') ||
          src.includes('3nbf4.com') ||
          src.includes('nap5k.com') ||
          src.includes('onclicka') ||
          src.includes('adsterra') ||
          src.includes('popunder') ||
          src.includes('vignette') ||
          text.includes('adsbygoogle') ||
          text.includes('monetag') ||
          text.includes('quge5') ||
          text.includes('10601960') ||
          text.includes('10601962')
        ) {
          script.remove();
        }
      });

      // Remove AMP auto ads element
      document.querySelectorAll('amp-auto-ads').forEach(el => el.remove());

      // Remove AdSense ins elements
      document.querySelectorAll('ins.adsbygoogle').forEach(el => {
        const parent = el.parentElement;
        if (parent?.classList.contains('google-ad-container')) {
          parent.remove();
        } else {
          el.remove();
        }
      });

      // Remove container-* divs (Monetag injected)
      document.querySelectorAll('div[id^="container-"]').forEach(el => el.remove());

      // Remove Monetag iframes (but allow Daily.co)
      document.querySelectorAll('iframe').forEach(iframe => {
        const src = iframe.getAttribute('src') || '';
        if (src.includes('daily.co') || src.includes('duelverse')) return;
        if (
          src.includes('monetag') || src.includes('quge5') ||
          src.includes('onclicka') || src.includes('adsterra') ||
          src.includes('vignette')
        ) {
          iframe.remove();
        }
      });

      // Remove high z-index overlay elements (ad popups)
      document.querySelectorAll('div').forEach(el => {
        const style = el.getAttribute('style') || '';
        const id = el.id || '';
        if (
          (style.includes('z-index') && (style.includes('9999') || style.includes('2147483647')) && style.includes('fixed')) ||
          id.includes('monetag') || id.includes('quge5')
        ) {
          el.remove();
        }
      });
    };

    // Immediate cleanup
    cleanAllAds();

    // Aggressive cleanup every 2s
    const interval = setInterval(cleanAllAds, 2000);

    // MutationObserver for instant blocking
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          const el = node as Element;
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
          if (tag === 'INS' && el.classList.contains('adsbygoogle')) el.remove();
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
