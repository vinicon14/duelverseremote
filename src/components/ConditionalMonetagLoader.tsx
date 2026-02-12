import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAccountType } from '@/hooks/useAccountType';

/**
 * Conditional Monetag Loader
 * 
 * UPDATED: Free users now get REDUCED Monetag ads
 * 
 * Strategy:
 * - PRO users: NO Monetag (completely blocked)
 * - FREE users: REDUCED Monetag with frequency control
 *   - Only load on specific pages (not all pages)
 *   - Less intrusive script configuration
 *   - Frequency limiting to prevent ad fatigue
 * 
 * This balances monetization with user experience
 */
// Check if ads should be loaded on current page
const checkIfShouldLoadAds = (pathname: string): boolean => {
  // List of pages where ads are allowed for free users
  const allowedPages = [
    '/',
    '/duels',
    '/tournaments',
    '/weekly-tournaments',
    '/ranking',
    '/news',
    '/store'
  ];
  
  // Exclude pages that should never have ads
  const excludedPages = [
    '/duel',  // Bloquear ALL ads in DuelRoom
    '/duelcoins',
    '/profile',
    '/friends',
    '/chat',
    '/auth',
    '/admin',
    '/judge-panel',
    '/create-',
    '/tournament-',
    '/deck-builder',
    '/install'
  ];
  
  // Check if current page is in excluded list
  const isExcluded = excludedPages.some(page => pathname.includes(page));
  if (isExcluded) return false;
  
  // Check if current page is in allowed list
  const isAllowed = allowedPages.some(page => pathname === page || pathname.startsWith(page + '/'));
  
  return isAllowed;
};

// Check frequency limiting (prevent ad fatigue)
const shouldLimitFrequency = (): boolean => {
  const now = Date.now();
  const lastAdTime = localStorage.getItem('monetag_last_ad');
  const adCountToday = parseInt(localStorage.getItem('monetag_count_today') || '0');
  const lastResetDate = localStorage.getItem('monetag_last_reset');
  
  // Reset counter daily
  const today = new Date().toDateString();
  if (lastResetDate !== today) {
    localStorage.setItem('monetag_count_today', '0');
    localStorage.setItem('monetag_last_reset', today);
    return false;
  }
  
  // Limit ads per day (max 20 ad loads per day for free users)
  if (adCountToday >= 20) {
    return true;
  }
  
  // Limit frequency between ads (minimum 3 minutes between ad loads)
  if (lastAdTime && (now - parseInt(lastAdTime)) < 3 * 60 * 1000) {
    return true;
  }
  
  return false;
};

// Update frequency tracking
const updateFrequencyTracking = (): void => {
  const now = Date.now().toString();
  const adCountToday = parseInt(localStorage.getItem('monetag_count_today') || '0');
  
  localStorage.setItem('monetag_last_ad', now);
  localStorage.setItem('monetag_count_today', String(adCountToday + 1));
};

export const ConditionalMonetagLoader = () => {
  const location = useLocation();
  const { isPro, loading } = useAccountType();

  useEffect(() => {
    // Don't run while loading
    if (loading) return;

    // Apply UNIVERSAL new tab blocking FIRST, before any Monetag loading
    applyUniversalBlocking();

    // MONETAG COMPLETELY DISABLED - No ads will be loaded
    // This prevents any popup/new tab ads from appearing
    console.log('Monetag COMPLETAMENTE DESATIVADO - nenhum anúncio será carregado');
    console.log('Todos os anúncios que abrem novas guias estão bloqueados');

    return () => {
      // Cleanup any existing script
      const existingScript = document.getElementById('monetag-conditional-loader');
      if (existingScript) {
        existingScript.remove();
      }
    };
  }, [location.pathname, isPro, loading]);

  // Apply universal blocking immediately
  useEffect(() => {
    applyUniversalBlocking();
  }, []);
};

// Universal blocking function - blocks ONLY intrusive new tabs for ALL users
const applyUniversalBlocking = () => {
  if (window._originalOpen) return; // Already applied

  console.log('🚫 Aplicando BLOQUEIO UNIVERSAL de novas guias INTRUSIVAS para TODOS');
  
  window._originalOpen = window.open;
  
  window.open = function(...args: Parameters<typeof window.open>): Window | null {
    const url = args[0];
    const target = args[1] || '';
    
    const urlString = typeof url === 'string' ? url : url?.toString() || '';
    
    // UNIVERSAL BLOCK: Block ONLY intrusive new tab patterns (popups, popunders)
    // Allow Monetag scripts to load but block their popup behaviors
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
      urlString.includes('offerwall') ||
      urlString.includes('survey') ||
      urlString.includes('reward') ||
      urlString.includes('tabunder') ||
      urlString.includes('popcash') ||
      urlString.includes('propellerads')
    ) {
      console.log('🚫 BLOQUEADO UNIVERSAL - nova guia intrusiva:', urlString);
      return null;
    }
    
    // DON'T block Monetag script URLs (quge5, monetag) - let them load for banner ads
    // Only block suspicious _blank opens
    if (target === '_blank') {
      const safeDomains = [
        'discord.com', 'discord.gg', 'youtube.com', 'youtu.be',
        'twitter.com', 'x.com', 'github.com', 'stackoverflow.com', 'reddit.com',
        'quge5.com', 'monetag.net' // Allow these to open in new tabs if needed
      ];
      
      const isSafeDomain = safeDomains.some(domain => urlString.includes(domain));
      
      if (!isSafeDomain && urlString.startsWith('http') && !urlString.includes('quge5') && !urlString.includes('monetag')) {
        console.log('🚫 BLOQUEADO UNIVERSAL - _blank suspeito:', urlString);
        return null;
      }
    }
    
    // Block obviously malicious popups
    if (!urlString || urlString === 'about:blank' || urlString.startsWith('javascript:')) {
      console.log('🚫 BLOQUEADO UNIVERSAL - popup suspeito:', urlString);
      return null;
    }
    
    console.log('✅ Popup permitido:', urlString);
    return window._originalOpen?.apply(window, args);
  };
};
