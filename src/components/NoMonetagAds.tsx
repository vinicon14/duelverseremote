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

    // UNIVERSAL NEW TAB BLOCKING FOR ALL USERS - Apply immediately regardless of user type
    console.log('Aplicando BLOQUEIO UNIVERSAL de novas guias para TODOS os usuários');
    
    // Apply universal new tab blocking first
    applyUniversalNewTabBlock();

    // Then apply user-specific blocking
    if (isPro) {
      console.log('PRO detectado - aplicando bloqueio COMPLETO');
      window._monetagBlocked = true;
      enableBlocking();
    } else {
      console.log('Usuário FREE - aplicando bloqueio REDUZIDO com bloqueio universal de novas guias');
      window._monetagBlocked = false; // Don't block all Monetag elements
      enableReducedBlocking();
    }

    return () => {
      window._monetagBlocked = false;
      disableBlocking();
    };
  }, [isPro, loading]);

  // UNIVERSAL new tab blocking function - applies to ALL users
  const applyUniversalNewTabBlock = () => {
    console.log('Aplicando BLOQUEIO UNIVERSAL de novas guias para TODOS os usuários');
    
    // Save original window.open if not already saved
    if (!window._originalOpen) {
      window._originalOpen = window.open;
    }

    // Override window.open to BLOCK ALL new tabs/pops for ALL users
    window.open = function(...args: Parameters<typeof window.open>): Window | null {
      const url = args[0];
      const target = args[1] || '';
      
      // Convert URL to string if needed
      const urlString = typeof url === 'string' ? url : url?.toString() || '';
      
      // UNIVERSAL BLOCK: Block ONLY intrusive new tab patterns
      // Allow Monetag scripts to load for banner ads
      if (
        urlString.includes('pop') ||
        urlString.includes('onclicka') ||
        urlString.includes('vignette') ||
        urlString.includes('adsterra') ||
        urlString.includes('popunder') ||
        urlString.includes('popup') ||
        urlString.includes('redirect') ||
        urlString.includes('offer') ||
        urlString.includes('adn') ||
        urlString.includes('traffic') ||
        urlString.includes('revenue') ||
        urlString.includes('offerwall') ||
        urlString.includes('survey') ||
        urlString.includes('reward')
      ) {
        console.log('🚫 BLOQUEADO UNIVERSAL - nova guia intrusiva:', urlString);
        return null;
      }
      
      // Block ONLY suspicious _blank opens, allow Monetag-related ones
      if (target === '_blank') {
        // Allow safe domains AND Monetag domains
        const safeDomains = [
          'discord.com', 'discord.gg', 'youtube.com', 'youtu.be',
          'twitter.com', 'x.com', 'github.com', 'stackoverflow.com',
          'reddit.com', 'quge5.com', 'monetag.net' // Allow Monetag for banners
        ];
        
        const isSafeDomain = safeDomains.some(domain => urlString.includes(domain));
        
        if (!isSafeDomain && urlString.startsWith('http') && !urlString.includes('quge5') && !urlString.includes('monetag')) {
          console.log('🚫 BLOQUEADO UNIVERSAL - _blank suspeito:', urlString);
          return null;
        }
      }
      
      // Block suspicious popup windows (empty URLs, javascript, etc.)
      if (!urlString || urlString === 'about:blank' || urlString.startsWith('javascript:')) {
        console.log('🚫 BLOQUEADO UNIVERSAL - popup suspeito:', urlString);
        return null;
      }
      
      // Allow legitimate popups
      console.log('✅ Permitido popup legítimo:', urlString);
      return window._originalOpen?.apply(window, args);
    };
  };

  // Function to enable COMPLETE blocking (for PRO users)
  const enableBlocking = () => {
    // UNIVERSAL NEW TAB BLOCK: Block ALL new tab/popups regardless of user type
    const originalOpen = window.open;
    window.open = function(...args: Parameters<typeof window.open>): Window | null {
      const url = args[0];
      const target = args[1] || '';
      
      // Convert URL to string if needed
      const urlString = typeof url === 'string' ? url : url?.toString() || '';
      
      // BLOCK ALL new tab ads - Universal blocking for all users
      if (
        urlString.includes('quge5') || 
        urlString.includes('monetag') || 
        urlString.includes('pop') ||
        urlString.includes('onclicka') ||
        urlString.includes('vignette') ||
        urlString.includes('adsterra') ||
        urlString.includes('popunder') ||
        urlString.includes('popup')
      ) {
        console.log('BLOQUEADO UNIVERSAL PRO - nova guia/popup:', urlString);
        return null;
      }
      
      // Block suspicious popup windows
      if (target === '_blank' && urlString && !urlString.startsWith('http') && !urlString.startsWith('/')) {
        console.log('Bloqueado popup suspeito:', urlString);
        return null;
      }
      
      // Allow legitimate popups
      return originalOpen.apply(window, args);
    };
    window._originalOpen = originalOpen;

    // COMPLETE cleanup function - removes ALL Monetag elements for PRO users
    const cleanup = () => {
      // Remove ALL Monetag scripts
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
          textContent.includes('monetag') ||
          textContent.includes('popunder') ||
          textContent.includes('onclicka') ||
          textContent.includes('vignette')
        ) {
          script.remove();
          console.log('Removido script Monetag (PRO):', src);
        }
      });

      // Remove ALL Monetag iframes
      document.querySelectorAll('iframe').forEach((iframe) => {
        const src = iframe.getAttribute('src') || '';
        const id = iframe.id || '';
        const className = iframe.className || '';
        if (
          src.includes('quge5') || 
          src.includes('monetag') ||
          src.includes('adsterra') ||
          src.includes('onclicka') ||
          src.includes('vignette') ||
          id.includes('quge5') ||
          id.includes('monetag') ||
          className.includes('quge5') ||
          className.includes('monetag')
        ) {
          iframe.remove();
          console.log('Removido iframe Monetag (PRO):', src);
        }
      });

      // Remove ALL popup/overlay elements
      document.querySelectorAll('*').forEach((el) => {
        const id = el.id || '';
        const className = el.className || '';
        const style = el.getAttribute('style') || '';
        
        // Block ALL popup/overlay ads
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
          console.log('Removido elemento popup/overlay (PRO):', id || className);
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

    // MutationObserver para bloquear novos elementos
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
                textContent.includes('monetag') ||
                textContent.includes('popunder') ||
                textContent.includes('onclicka') ||
                textContent.includes('vignette')
              ) {
                el.remove();
                console.log('Bloqueado script injetado (PRO):', src);
              }
            }
            
            // Check iframes
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
                console.log('Bloqueado iframe injetado (PRO):', src);
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
              console.log('Bloqueado elemento popup/overlay injetado (PRO):', id || className);
            }
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
    
    // Store observer for cleanup
    (window as Window & { _monetagObserver?: MutationObserver })._monetagObserver = observer;
    
    // Use longer interval for cleanup (every 5 seconds)
    const interval = setInterval(cleanup, 5000);
    (window as Window & { _monetagInterval?: number })._monetagInterval = interval as unknown as number;

    return () => {
      console.log('Desativando bloqueador Monetag (PRO)');
      observer.disconnect();
      clearInterval(interval);
      window._monetagBlocked = false;
      
      // Restore window.open
      if (window._originalOpen) {
        window.open = window._originalOpen;
      }
    };
  };

  // Function to enable REDUCED blocking (for free users)
  const enableReducedBlocking = () => {
    // NEW TAB ADS ALREADY BLOCKED by universal blocking above
    // This function now only handles banner ads and other elements

    // REDUCED cleanup function - only removes most intrusive elements for free users
    const cleanup = () => {
      // For free users, only remove scripts that create popups/new tabs
      // Allow banner ads to remain
      document.querySelectorAll('script').forEach((script) => {
        const src = script.getAttribute('src') || '';
        const textContent = script.textContent || '';
        if (
          src.includes('popunder') ||
          src.includes('onclicka') ||
          src.includes('vignette') ||
          textContent.includes('popunder') ||
          textContent.includes('onclicka') ||
          textContent.includes('vignette')
        ) {
          script.remove();
          console.log('Removido script intrusivo:', src);
        }
      });

      // REDUCED iframe removal - only remove popups/new tabs for free users
      document.querySelectorAll('iframe').forEach((iframe) => {
        const src = iframe.getAttribute('src') || '';
        const id = iframe.id || '';
        const className = iframe.className || '';
        if (
          src.includes('onclicka') ||
          src.includes('vignette') ||
          id.includes('popup') ||
          id.includes('popunder') ||
          className.includes('popup') ||
          className.includes('popunder')
        ) {
          iframe.remove();
          console.log('Removido iframe intrusivo:', src);
        }
      });

      // REDUCED element removal - only block most intrusive popups/overlays
      document.querySelectorAll('*').forEach((el) => {
        const id = el.id || '';
        const className = el.className || '';
        const style = el.getAttribute('style') || '';
        
        // Only block full-screen overlays and very intrusive popups
        const isIntrusivePopup = 
          (style.includes('fixed') && style.includes('z-index') && style.includes('2147483647')) ||
          id.includes('popunder') ||
          className.includes('popunder');
        
        if (isIntrusivePopup) {
          el.remove();
          console.log('Removido elemento intrusivo:', id || className);
        }
      });

      // Remove only elements with intrusive attributes
      document.querySelectorAll('[data-popunder], [data-onclicka]').forEach(el => {
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
    
    // Use much longer interval for cleanup (every 10 seconds) for free users
    // Since we're allowing some ads, we don't need aggressive cleanup
    const interval = setInterval(cleanup, 10000);
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
    
    // IMPORTANT: NEVER restore window.open completely - keep universal blocking active
    // The universal new tab blocking should always remain active
    console.log('⚠️ Mantendo bloqueio universal de novas guias ativo');
    
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
