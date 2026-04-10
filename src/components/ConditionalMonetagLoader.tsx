import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAccountType } from '@/hooks/useAccountType';

/**
 * Conditional Monetag Loader
 * 
 * - PRO / Native / Electron: NO ads at all
 * - FREE on /duel/*, /pro/*, /auth, /landing, /: NO ads
 * - FREE on other pages: notification ads only (no popunder/popup)
 */

declare global {
  interface Window {
    _originalOpen?: typeof window.open;
  }
}

export const ConditionalMonetagLoader = (): null => {
  const location = useLocation();
  const { isPro, loading } = useAccountType();
  const isNativeApp = /DuelVerseApp/i.test(navigator.userAgent);
  const isElectron = !!(window as any).electronAPI?.isElectron;

  useEffect(() => {
    applyPopupBlocking();
  }, []);

  useEffect(() => {
    // While loading PRO status, don't inject anything
    if (loading) {
      removeExistingMonetagAssets();
      return;
    }

    // Block for native apps
    if (isNativeApp || isElectron) {
      removeExistingMonetagAssets();
      const interval = setInterval(removeExistingMonetagAssets, 2000);
      return () => clearInterval(interval);
    }

    // Block for PRO users
    if (isPro) {
      removeExistingMonetagAssets();
      const interval = setInterval(removeExistingMonetagAssets, 2000);
      return () => clearInterval(interval);
    }

    // Block on specific routes (duel rooms, auth, landing, pro routes)
    const blockedPrefixes = ['/duel/', '/pro/', '/auth', '/landing', '/'];
    const isBlockedRoute = location.pathname === '/' || 
      location.pathname === '/auth' || 
      location.pathname === '/landing' ||
      location.pathname.startsWith('/duel/') || 
      location.pathname.startsWith('/pro/');

    if (isBlockedRoute) {
      removeExistingMonetagAssets();
      return;
    }

    // Additional excluded pages
    const excludedPages = [
      '/duel-room', '/duelcoins', '/profile', '/friends', '/chat',
      '/admin', '/judge-panel', '/create-', '/tournament-',
      '/deck-builder', '/install'
    ];
    if (excludedPages.some(page => location.pathname.includes(page))) {
      return;
    }

    // FREE users on allowed pages: inject notification ads only
    const notif1 = document.createElement('script');
    notif1.src = 'https://3nbf4.com/act/files/tag.min.js?z=10601960';
    notif1.setAttribute('data-cfasync', 'false');
    notif1.async = true;
    notif1.id = 'monetag-notification-1';
    document.head.appendChild(notif1);

    const notif2 = document.createElement('script');
    notif2.innerHTML = `(function(s){s.dataset.zone='10601962',s.src='https://nap5k.com/tag.min.js'})([document.documentElement, document.body].filter(Boolean).pop().appendChild(document.createElement('script')))`;
    notif2.id = 'monetag-notification-2';
    document.head.appendChild(notif2);

    return () => {
      ['monetag-notification-1', 'monetag-notification-2'].forEach(id => {
        document.getElementById(id)?.remove();
      });
    };
  }, [location.pathname, isPro, loading, isNativeApp, isElectron]);

  return null;
};

function applyPopupBlocking() {
  if (window._originalOpen) return;

  window._originalOpen = window.open;
  
  window.open = function(...args: Parameters<typeof window.open>): Window | null {
    const url = args[0];
    const urlString = typeof url === 'string' ? url : url?.toString() || '';
    
    const blockedPatterns = [
      'popunder', 'popup', 'onclicka', 'vignette', 'tabunder',
      'popcash', 'propellerads', 'quge5.com', 'al5sm.com'
    ];
    
    if (blockedPatterns.some(p => urlString.includes(p))) return null;
    
    const safeDomains = [
      'discord.com', 'discord.gg', 'youtube.com', 'youtu.be',
      'twitter.com', 'x.com', 'github.com', 'stackoverflow.com', 'reddit.com',
      'google.com', 'facebook.com', 'instagram.com', 'duelverse'
    ];
    
    const allowedPatterns = ['3nbf4.com', 'nap5k.com', 'tag.min.js'];
    const isAllowed = allowedPatterns.some(p => urlString.includes(p));
    const isSafe = safeDomains.some(d => urlString.includes(d));
    
    if (!isSafe && !isAllowed && urlString.startsWith('http')) return null;
    
    return window._originalOpen?.apply(window, args) ?? null;
  };
}

function removeExistingMonetagAssets() {
  const root = document.getElementById('root');
  
  document.querySelectorAll('script').forEach(script => {
    if (root?.contains(script)) return;
    const src = script.getAttribute('src') || '';
    const text = script.textContent || '';
    if (
      src.includes('monetag') || src.includes('3nbf4.com') || src.includes('nap5k.com') ||
      src.includes('quge5') || src.includes('onclicka') ||
      text.includes('10601960') || text.includes('10601962') || text.includes('monetag')
    ) {
      script.remove();
    }
  });

  document.querySelectorAll('div[id^="container-"], iframe').forEach(el => {
    if (root?.contains(el)) return;
    const src = el.getAttribute('src') || '';
    const id = el.getAttribute('id') || '';
    if (
      id.startsWith('container-') || src.includes('monetag') || src.includes('quge5') ||
      src.includes('onclicka') || src.includes('3nbf4.com') || src.includes('nap5k.com')
    ) {
      el.remove();
    }
  });
}
