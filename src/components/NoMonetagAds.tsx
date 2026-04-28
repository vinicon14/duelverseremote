import { useEffect, useRef } from "react";

/**
 * NoMonetagAds - Safe ad cleanup for DuelRoom
 * ONLY removes elements with explicit Monetag/ad signatures.
 * NEVER touches #root or any React portal.
 */

declare global {
  interface Window {
    _monetagBlocked?: boolean;
    _originalOpen?: typeof window.open;
    _monetagObserver?: MutationObserver;
  }
}

const AD_SRC_PATTERNS = [
  'monetag', 'quge5', '3nbf4.com', 'nap5k.com', 'onclicka',
  'adsterra', 'popunder', 'al5sm.com', 'popcash', 'propellerads',
  'vignette', 'tag.min.js', 'adsbygoogle', 'pagead2.googlesyndication',
];

const AD_TEXT_PATTERNS = [
  'monetag', 'quge5', '10601960', '10601962', 'nap5k', '3nbf4',
];

function isAdScript(src: string, text: string): boolean {
  const s = src.toLowerCase();
  const t = text.toLowerCase();
  return AD_SRC_PATTERNS.some(p => s.includes(p)) ||
         AD_TEXT_PATTERNS.some(p => t.includes(p));
}

function isAdIframe(src: string): boolean {
  if (!src) return false;
  // Never touch app-owned iframes
  if (src.includes('duelverse')) return false;
  return AD_SRC_PATTERNS.some(p => src.includes(p));
}

function safeCleanup() {
  const root = document.getElementById('root');

  // Remove ad scripts outside React
  document.querySelectorAll('script').forEach(script => {
    if (root?.contains(script)) return;
    const src = script.getAttribute('src') || '';
    const text = script.textContent || '';
    if (isAdScript(src, text)) script.remove();
  });

  // Remove ad iframes outside React
  document.querySelectorAll('iframe').forEach(iframe => {
    if (root?.contains(iframe)) return;
    const src = iframe.getAttribute('src') || '';
    if (isAdIframe(src)) iframe.remove();
  });

  // Remove Monetag-identified divs outside React
  document.querySelectorAll('body > div, body > section, body > aside').forEach(el => {
    if (root?.contains(el)) return;
    if (el === root) return;
    const id = el.id || '';
    const cn = typeof el.className === 'string' ? el.className : '';
    if (id.includes('monetag') || id.includes('quge5') || cn.includes('monetag') || cn.includes('quge5')) {
      el.remove();
    }
  });

  // Remove Monetag data-attributed elements
  document.querySelectorAll('[data-quge5], [data-monetag], [data-popunder], [data-onclicka]').forEach(el => {
    if (root?.contains(el)) return;
    el.remove();
  });

  // Remove container-* divs outside React (Monetag pattern)
  document.querySelectorAll('div[id^="container-"]').forEach(el => {
    if (root?.contains(el)) return;
    el.remove();
  });
}

export const NoMonetagAds = () => {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);

  useEffect(() => {
    // Immediate cleanup on mount (entering DuelRoom)
    safeCleanup();

    // Periodic safe cleanup
    intervalRef.current = setInterval(safeCleanup, 3000);

    // MutationObserver to catch dynamically injected ads
    const root = document.getElementById('root');
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          const el = node as Element;
          if (root?.contains(el)) continue;

          if (el.tagName === 'SCRIPT') {
            const src = el.getAttribute('src') || '';
            const text = el.textContent || '';
            if (isAdScript(src, text)) el.remove();
          }

          if (el.tagName === 'IFRAME') {
            const src = el.getAttribute('src') || '';
            if (isAdIframe(src)) el.remove();
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: false });
    // Also observe head for scripts
    observer.observe(document.head, { childList: true });
    observerRef.current = observer;

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, []);

  return null;
};
