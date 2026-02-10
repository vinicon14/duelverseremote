import { useEffect } from 'react';
import { useAccountType } from '@/hooks/useAccountType';

/**
 * Controls Monetag/Quge5 ads:
 * - PRO users: removes all Monetag injected elements and blocks future injections
 * - Free users: reduces ad frequency by removing excess popups/overlays
 */
export const MonetagAdController = () => {
  const { isPro, loading } = useAccountType();

  useEffect(() => {
    if (loading) return;

    const removeMonetag = () => {
      // Remove Monetag injected iframes and overlays
      const monetagSelectors = [
        'iframe[src*="monetag"]',
        'iframe[src*="quge5"]',
        'iframe[src*="onclicka"]',
        'iframe[src*="vignette"]',
        'div[id*="monetag"]',
        'div[class*="monetag"]',
        'div[id*="tag-container"]',
        // Common Monetag overlay patterns
        'div[style*="z-index: 2147483647"]',
        'div[style*="z-index:2147483647"]',
      ];

      monetagSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => el.remove());
      });
    };

    if (isPro) {
      // For PRO: aggressively remove all Monetag elements
      removeMonetag();

      // Also remove the Monetag script tag to prevent further loading
      document.querySelectorAll('script[src*="quge5"]').forEach(el => el.remove());
      document.querySelectorAll('script[src*="monetag"]').forEach(el => el.remove());

      // MutationObserver to catch dynamically injected ads
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node instanceof HTMLElement) {
              const src = node.getAttribute?.('src') || '';
              const id = node.getAttribute?.('id') || '';
              const style = node.getAttribute?.('style') || '';
              
              if (
                src.includes('monetag') ||
                src.includes('quge5') ||
                src.includes('onclicka') ||
                id.includes('monetag') ||
                // Block high z-index overlays from Monetag
                (node.tagName === 'DIV' && style.includes('2147483647'))
              ) {
                node.remove();
              }
            }
          }
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });
      return () => observer.disconnect();
    } else {
      // For FREE: reduce frequency - remove duplicate overlays, keep max 1 at a time
      let adCount = 0;
      const MAX_ADS = 1;

      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node instanceof HTMLElement) {
              const style = node.getAttribute?.('style') || '';
              const src = node.getAttribute?.('src') || '';

              // Detect Monetag overlay popups
              if (
                (node.tagName === 'DIV' && style.includes('2147483647')) ||
                (node.tagName === 'IFRAME' && (src.includes('onclicka') || src.includes('vignette')))
              ) {
                adCount++;
                if (adCount > MAX_ADS) {
                  node.remove();
                }
              }
            }
          }
        }
      });

      // Reset counter periodically (allow 1 ad per 5 minutes)
      const interval = setInterval(() => {
        adCount = 0;
      }, 5 * 60 * 1000);

      observer.observe(document.body, { childList: true, subtree: true });
      return () => {
        observer.disconnect();
        clearInterval(interval);
      };
    }
  }, [isPro, loading]);

  return null;
};
