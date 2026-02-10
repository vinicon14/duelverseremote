import { useEffect, useRef } from "react";
import { useAccountType } from "@/hooks/useAccountType";

// Extend Window interface for our custom properties
declare global {
  interface Window {
    _monetagBlocked?: boolean;
    _originalOpen?: typeof window.open;
    _monetagObserver?: MutationObserver;
  }
}

export const NoMonetagAds = () => {
  const { isPro, loading } = useAccountType();
  const cleanupDoneRef = useRef(false);

  useEffect(() => {
    // Don't run while loading
    if (loading) return;

    // For PRO users - block all ads immediately
    if (isPro) {
      console.log('PRO detectado - bloqueando Monetag completamente');
      window._monetagBlocked = true;
      enableBlocking();
      return;
    }

    // For FREE users - block popup/overlay ads (new tab ads) but allow page to load normally
    console.log('Usuário FREE - bloqueando popup/overlay ads (novas guias)');
    window._monetagBlocked = true;
    
    // Enable blocking but with less aggressive cleanup
    enableBlocking();

    // For free users, we DON'T disable blocking after 60 seconds
    // We keep blocking popup/overlay ads (new tab ads) forever
    // This is the key change - previously it was disabling blocking after 60s

    return () => {
      window._monetagBlocked = false;
      disableBlocking();
    };
  }, [isPro, loading]);

  // Function to enable blocking (for PRO users AND free users)
  const enableBlocking = () => {
    // Override window.open to block popups (new tab ads)
    const originalOpen = window.open;
    window.open = function(...args: Parameters<typeof window.open>): Window | null {
      const url = args[0];
      const target = args[1] || '';
      
      // Convert URL to string if needed
      const urlString = typeof url === 'string' ? url : url?.toString() || '';
      
      // Block if it's Monetag related (new tab ads)
      if (
        urlString.includes('quge5') || 
        urlString.includes('monetag') || 
        urlString.includes('pop') ||
        urlString.includes('onclicka') ||
        urlString.includes('vignette')
      ) {
        console.log('Bloqueado popup Monetag (nova guia):', urlString);
        return null;
      }
      
      // Block suspicious popup windows
      if (target === '_blank' && urlString && !urlString.startsWith('http')) {
        console.log('Bloqueado popup suspeito:', urlString);
        return null;
      }
      
      return originalOpen.apply(window, args);
    };
    window._originalOpen = originalOpen;

    // Cleanup function - removes injected Monetag elements
    const cleanup = () => {
      // Remove Monetag scripts
      document.querySelectorAll('script').forEach((script) => {
        const src = script.getAttribute('src') || '';
        const textContent = script.textContent || '';
        if (
          src.includes('quge5') || 
          src.includes('monetag') || 
          src.includes('adsterra') ||
          src.includes('popunder') ||
          src.includes('onclicka') ||
          src.includes('vignette') ||
          textContent.includes('quge5') ||
          textContent.includes('monetag')
        ) {
          script.remove();
          console.log('Removido script Monetag:', src);
        }
      });

      // Remove Monetag iframes (popup/overlay ads)
      document.querySelectorAll('iframe').forEach((iframe) => {
        const src = iframe.getAttribute('src') || '';
        const id = iframe.id || '';
        const className = iframe.className || '';
        if (
          src.includes('quge5') || 
          src.includes('monetag') ||
          src.includes('onclicka') ||
          src.includes('vignette') ||
          id.includes('quge5') ||
          id.includes('monetag') ||
          className.includes('quge5') ||
          className.includes('monetag')
        ) {
          iframe.remove();
          console.log('Removido iframe Monetag:', src);
        }
      });

      // Remove popup/overlay elements (fixed position, high z-index)
      document.querySelectorAll('*').forEach((el) => {
        const id = el.id || '';
        const className = el.className || '';
        const style = el.getAttribute('style') || '';
        
        // Block popup/overlay ads (fixed position, high z-index, or Monetag related)
        const isPopupOrOverlay = 
          (style.includes('fixed') && style.includes('z-index') && (style.includes('9999') || style.includes('2147483647'))) ||
          id.includes('quge5') || 
          id.includes('monetag') ||
          id.includes('popup') ||
          id.includes('popunder') ||
          className.includes('quge5') || 
          className.includes('monetag') ||
          className.includes('popup') ||
          className.includes('popunder') ||
          className.includes('overlay');
        
        if (isPopupOrOverlay) {
          el.remove();
          console.log('Removido elemento popup/overlay:', id || className);
        }
      });

      // Remove any element with Monetag-related attributes
      document.querySelectorAll('[data-quge5], [data-monetag], [data-popunder], [data-onclicka]').forEach(el => {
        el.remove();
      });
    };

    // Initial cleanup
    cleanup();
    cleanupDoneRef.current = true;

    // MutationObserver para bloquear novos elementos popup/overlay
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            const el = node as Element;
            const style = el.getAttribute?.('style') || '';
            const id = el.id || '';
            const className = el.className || '';
            
            // Check scripts
            if (el.tagName === 'SCRIPT') {
              const src = el.getAttribute('src') || '';
              const textContent = el.textContent || '';
              if (
                src.includes('quge5') || 
                src.includes('monetag') ||
                src.includes('adsterra') ||
                src.includes('popunder') ||
                src.includes('onclicka') ||
                src.includes('vignette') ||
                textContent.includes('quge5') ||
                textContent.includes('monetag')
              ) {
                el.remove();
                console.log('Bloqueado script injetado:', src);
              }
            }
            
            // Check iframes (popup/overlay ads)
            if (el.tagName === 'IFRAME') {
              const src = el.getAttribute('src') || '';
              if (
                src.includes('quge5') || 
                src.includes('monetag') ||
                src.includes('adsterra') ||
                src.includes('onclicka') ||
                src.includes('vignette')
              ) {
                el.remove();
                console.log('Bloqueado iframe injetado:', src);
              }
            }

            // Check popup/overlay elements
            const isPopupOrOverlay = 
              (style.includes('fixed') && style.includes('z-index') && (style.includes('9999') || style.includes('2147483647'))) ||
              id.includes('quge5') || 
              id.includes('monetag') ||
              id.includes('popup') ||
              id.includes('popunder') ||
              className.includes('quge5') || 
              className.includes('monetag') ||
              className.includes('popup') ||
              className.includes('popunder') ||
              className.includes('overlay');
            
            if (isPopupOrOverlay) {
              el.remove();
              console.log('Bloqueado elemento popup/overlay injetado:', id || className);
            }
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
    
    // Store observer for cleanup
    (window as Window & { _monetagObserver?: MutationObserver })._monetagObserver = observer;
    
    // Use longer interval for cleanup (every 5 seconds instead of 500ms) to improve performance
    const interval = setInterval(cleanup, 5000);
    (window as Window & { _monetagInterval?: number })._monetagInterval = interval as unknown as number;

    return () => {
      console.log('Desativando bloqueador Monetag');
      observer.disconnect();
      clearInterval(interval);
      window._monetagBlocked = false;
      
      // Restore window.open
      if (window._originalOpen) {
        window.open = window._originalOpen;
      }
    };
  };

  // Function to disable blocking
  const disableBlocking = () => {
    console.log('Desativando bloqueador Monetag');
    
    // Restore window.open
    if (window._originalOpen) {
      window.open = window._originalOpen;
    }
    
    // Disconnect observer
    const observer = (window as Window & { _monetagObserver?: MutationObserver })._monetagObserver;
    if (observer) {
      observer.disconnect();
    }
    
    // Clear interval
    const interval = (window as Window & { _monetagInterval?: number })._monetagInterval;
    if (interval) {
      clearInterval(interval);
    }
  };

  return null;
};
