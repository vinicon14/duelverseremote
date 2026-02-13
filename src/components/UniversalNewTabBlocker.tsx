import { useEffect, useRef } from 'react';

// Extend Window interface for our blocking
declare global {
  interface Window {
    _universalTabBlockApplied?: boolean;
    _originalWindowOpen?: typeof window.open;
  }
}

/**
 * Universal New Tab Blocker
 * 
 * This component blocks ALL new tab/popups for ALL users
 * regardless of account type (PRO or FREE)
 * 
 * It should be imported and used at the top level of the app
 * to ensure blocking is applied before any Monetag scripts load
 */
export const UniversalNewTabBlocker = () => {
  const appliedRef = useRef(false);

  useEffect(() => {
    if (appliedRef.current || window._universalTabBlockApplied) {
      return;
    }

    console.log('🛡️ Installing UNIVERSAL New Tab Blocker for ALL users');

    // Save original window.open if not already saved
    if (!window._originalWindowOpen) {
      window._originalWindowOpen = window.open;
    }

    // Override window.open with universal blocking
    window.open = function(...args: Parameters<typeof window.open>): Window | null {
      const url = args[0];
      const target = args[1] || '';
      
      // Convert URL to string if needed
      const urlString = typeof url === 'string' ? url : url?.toString() || '';
      
      // UNIVERSAL BLOCK: Block ONLY new tab/popups, NOT banner ad scripts
      // Allow banner ads to load for free users, block only intrusive behaviors
      const blockedPatterns = [
        'pop', 'onclicka', 'vignette', 'adsterra',
        'popunder', 'popup', 'redirect', 'offer',
        'adn', 'traffic', 'offerwall', 'survey', 'reward',
        'tabunder', 'popcash', 'propellerads'
      ];
      
      const isBlocked = blockedPatterns.some(pattern => 
        urlString.toLowerCase().includes(pattern.toLowerCase())
      );

      if (isBlocked) {
        console.log('🚫 UNIVERSAL BLOCK - Ad-related new tab blocked:', urlString);
        return null;
      }
      
      // Block ALL _blank opens unless from safe domains
      if (target === '_blank') {
        const safeDomains = [
          'discord.com', 'discord.gg', 'youtube.com', 'youtu.be',
          'twitter.com', 'x.com', 'github.com', 'stackoverflow.com',
          'reddit.com', 'wikipedia.org', 'google.com', 'stackoverflow.com'
        ];
        
        const isSafeDomain = safeDomains.some(domain => 
          urlString.toLowerCase().includes(domain.toLowerCase())
        );
        
        // Block suspicious _blank opens
        if (!isSafeDomain && urlString.startsWith('http')) {
          console.log('🚫 UNIVERSAL BLOCK - Suspicious _blank blocked:', urlString);
          return null;
        }
      }
      
      // Block obviously malicious popups
      if (!urlString || urlString === 'about:blank' || urlString.startsWith('javascript:')) {
        console.log('🚫 UNIVERSAL BLOCK - Malicious popup blocked:', urlString);
        return null;
      }
      
      // Allow legitimate popups
      console.log('✅ UNIVERSAL BLOCK - Legitimate popup allowed:', urlString);
      return window._originalWindowOpen?.apply(window, args);
    };

    // Apply additional blocking measures ONLY for intrusive behaviors
    const blockClickHandlers = () => {
      // Block click handlers that might open new tabs
      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const link = target.closest('a');
        
        if (link && link.target === '_blank') {
          const href = link.href;
          
          const isBlocked = blockedPatterns.some(pattern => 
            href.toLowerCase().includes(pattern.toLowerCase())
          );
          
          if (isBlocked) {
            e.preventDefault();
            e.stopPropagation();
            console.log('🚫 UNIVERSAL BLOCK - Click handler blocked:', href);
            return false;
          }
        }
      }, true);
    };

    blockClickHandlers();
    
    // Mark as applied
    appliedRef.current = true;
    window._universalTabBlockApplied = true;

    console.log('✅ Universal New Tab Blocker installed successfully');

    return () => {
      // Never remove the blocking on unmount - it should persist
      console.log('🛡️ Universal New Tab Blocker will remain active');
    };
  }, []);

  return null;
};