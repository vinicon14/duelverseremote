import { useEffect } from "react";
import { useAccountType } from "@/hooks/useAccountType";

/**
 * ProAdCleaner - Remove ALL ad scripts/elements for PRO users
 * Safe version: NEVER touches #root or any element inside the React tree.
 */
export const ProAdCleaner = () => {
  const { isPro, loading } = useAccountType();

  useEffect(() => {
    if (loading || !isPro) return;

    const root = document.getElementById('root');
    const isInsideReact = (el: Element) => root?.contains(el) || el === root;

    const AD_PATTERNS = [
      'adsbygoogle', 'pagead2.googlesyndication', 'ampproject.org',
      'monetag', 'quge5', '3nbf4.com', 'nap5k.com', 'onclicka',
      'adsterra', 'popunder', 'al5sm.com', 'popcash', 'propellerads',
      'vignette', 'tag.min.js'
    ];

    const TEXT_PATTERNS = [
      'adsbygoogle', 'monetag', 'quge5', '10601960', '10601962',
      'nap5k', '3nbf4'
    ];

    const matchesAd = (src: string, text: string) => {
      const s = src.toLowerCase();
      const t = text.toLowerCase();
      return AD_PATTERNS.some(p => s.includes(p)) || TEXT_PATTERNS.some(p => t.includes(p));
    };

    const cleanAllAds = () => {
      document.querySelectorAll('script').forEach(script => {
        if (isInsideReact(script)) return;
        if (matchesAd(script.getAttribute('src') || '', script.textContent || '')) script.remove();
      });

      document.querySelectorAll('amp-auto-ads').forEach(el => {
        if (!isInsideReact(el)) el.remove();
      });

      document.querySelectorAll('div[id^="container-"]').forEach(el => {
        if (!isInsideReact(el)) el.remove();
      });

      document.querySelectorAll('iframe').forEach(iframe => {
        if (isInsideReact(iframe)) return;
        const src = iframe.getAttribute('src') || '';
        if (src.includes('daily.co') || src.includes('duelverse')) return;
        if (!src || AD_PATTERNS.some(p => src.includes(p))) iframe.remove();
      });

      document.querySelectorAll('div[id^="google_ads_"], div.google-auto-placed, div[data-google-query-id]').forEach(el => {
        if (!isInsideReact(el)) el.remove();
      });

      document.querySelectorAll('[data-quge5], [data-monetag], [data-popunder], [data-onclicka]').forEach(el => {
        if (!isInsideReact(el)) el.remove();
      });
    };

    cleanAllAds();
    const interval = setInterval(cleanAllAds, 2000);

    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          const el = node as Element;
          if (isInsideReact(el)) continue;

          if (el.tagName === 'SCRIPT') {
            if (matchesAd(el.getAttribute('src') || '', el.textContent || '')) el.remove();
          }
          if (el.tagName === 'IFRAME') {
            const src = el.getAttribute('src') || '';
            if (src.includes('daily.co') || src.includes('duelverse')) continue;
            if (!src || AD_PATTERNS.some(p => src.includes(p))) el.remove();
          }
          if (el.tagName === 'AMP-AUTO-ADS') el.remove();
          if (el.tagName === 'DIV' && (el as HTMLElement).id?.startsWith('container-')) el.remove();
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: false });
    observer.observe(document.head, { childList: true });

    return () => {
      clearInterval(interval);
      observer.disconnect();
    };
  }, [isPro, loading]);

  return null;
};
