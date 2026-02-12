import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAccountType } from '@/hooks/useAccountType';

/**
 * Conditional Monetag Loader
 * 
 * Strategy:
 * - PRO users: NO Monetag (completely blocked)
 * - FREE users: Only notification ads
 *   - Popunder and popup/click ads are blocked
 *   - Only notification scripts are allowed
 * 
 * This allows monetization while preventing intrusive ads
 */
export const ConditionalMonetagLoader = () => {
  const location = useLocation();
  const { isPro, loading } = useAccountType();

  useEffect(() => {
    // Don't run while loading
    if (loading) return;

    // Apply popup blocking
    applyPopupBlocking();

    // PRO users: No Monetag
    if (location.pathname.startsWith('/pro/') || location.pathname === '/auth' || location.pathname === '/landing') {
      console.log('Monetag BLOQUEADO - rota PRO/auth/landing:', location.pathname);
      return;
    }

    if (isPro) {
      console.log('Monetag BLOQUEADO - usuário PRO');
      return;
    }

    // FREE users: Only notification ads (NO popunder, NO popup/click)
    const excludedPages = [
      '/duel', '/duelcoins', '/profile', '/friends', '/chat',
      '/admin', '/judge-panel', '/create-', '/tournament-',
      '/deck-builder', '/install'
    ];
    
    const isExcluded = excludedPages.some(page => location.pathname.includes(page));
    if (isExcluded) {
      console.log('Monetag BLOQUEADO - página restrita:', location.pathname);
      return;
    }

    console.log('Carregando notification ads:', location.pathname);
    
    // Notification script 1 (zone 10601960)
    const notificationScript1 = document.createElement('script');
    notificationScript1.src = 'https://3nbf4.com/act/files/tag.min.js?z=10601960';
    notificationScript1.setAttribute('data-cfasync', 'false');
    notificationScript1.async = true;
    notificationScript1.id = 'monetag-notification-1';
    document.head.appendChild(notificationScript1);

    // Notification script 2 (zone 10601962)
    const notificationScript2 = document.createElement('script');
    notificationScript2.innerHTML = `(function(s){s.dataset.zone='10601962',s.src='https://nap5k.com/tag.min.js'})([document.documentElement, document.body].filter(Boolean).pop().appendChild(document.createElement('script')))`;
    notificationScript2.id = 'monetag-notification-2';
    document.head.appendChild(notificationScript2);

    return () => {
      const scripts = ['monetag-notification-1', 'monetag-notification-2'];
      scripts.forEach(id => {
        const script = document.getElementById(id);
        if (script) script.remove();
      });
    };
  }, [location.pathname, isPro, loading]);

  useEffect(() => {
    applyPopupBlocking();
  }, []);
};

// Blocking function - blocks popunder and popup/click ads but allows notification
const applyPopupBlocking = () => {
  if (window._originalOpen) return;

  console.log('🚫 BLOQUEIO DE POPUNDER/POPUP/CLIQUE ATIVADO');
  
  window._originalOpen = window.open;
  
  window.open = function(...args: Parameters<typeof window.open>): Window | null {
    const url = args[0];
    const target = args[1] || '';
    const urlString = typeof url === 'string' ? url : url?.toString() || '';
    
    // BLOCK popunder and popup/click patterns
    const blockedPatterns = [
      'popunder', 'popup', 'onclicka', 'vignette', 'tabunder',
      'popcash', 'propellerads', 'quge5.com/88', 'al5sm.com'
    ];
    
    const isBlocked = blockedPatterns.some(pattern => urlString.includes(pattern));
    
    // Allow notification scripts
    const allowedPatterns = [
      '3nbf4.com',    // notification
      'nap5k.com',    // notification
      'tag.min.js'     // general ad script
    ];
    
    const isAllowed = allowedPatterns.some(pattern => urlString.includes(pattern));
    
    if (isBlocked && !isAllowed) {
      console.log('🚫 BLOQUEADO - popunder/popup/click:', urlString);
      return null;
    }
    
    // Allow only safe domains
    const safeDomains = [
      'discord.com', 'discord.gg', 'youtube.com', 'youtu.be',
      'twitter.com', 'x.com', 'github.com', 'stackoverflow.com', 'reddit.com',
      'google.com', 'facebook.com', 'instagram.com'
    ];
    
    const isSafeDomain = safeDomains.some(domain => urlString.includes(domain));
    
    if (!isSafeDomain && !isAllowed && urlString.startsWith('http')) {
      console.log('🚫 BLOQUEADO - domínio não permitido:', urlString);
      return null;
    }
    
    return window._originalOpen?.apply(window, args);
  };

  return null;
};
