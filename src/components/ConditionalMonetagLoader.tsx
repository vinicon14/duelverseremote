import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAccountType } from '@/hooks/useAccountType';

/**
 * Conditional Monetag Loader
 * 
 * IMPORTANT: Monetag ads are now BLOCKED for ALL free users
 * 
 * Rationale:
 * - Monetag's popup/overlay/new tab ads are very intrusive
 * - They slow down page loading and create bad user experience
 * - Free users now get a clean experience without Monetag
 * 
 * PRO users: NO Monetag (already blocked)
 * Free users: NO Monetag (changed from loading to blocking)
 */
export const ConditionalMonetagLoader = () => {
  const location = useLocation();
  const { isPro, loading } = useAccountType();

  useEffect(() => {
    // Don't run while loading
    if (loading) return;

    // Check if current route is a PRO route
    const isProRoute = location.pathname.startsWith('/pro/');
    const isAuthRoute = location.pathname === '/auth';
    const isLandingRoute = location.pathname === '/landing';

    // Don't load Monetag on PRO routes, auth page, or landing
    if (isProRoute || isAuthRoute || isLandingRoute) {
      console.log('Monetag BLOQUEADO - rota PRO/auth/landing:', location.pathname);
      return;
    }

    // Don't load if user is PRO (in case they somehow access non-PRO route)
    if (isPro) {
      console.log('Monetag BLOQUEADO - usuário PRO');
      return;
    }

    // FREE USERS: Monetag is now COMPLETELY BLOCKED
    // Previously it was loading Monetag for free users, but this caused
    // too many intrusive popup/overlay/new tab ads
    // 
    // If you want to enable minimal Monetag ads in the future, 
    // uncomment the code below but be aware this may harm user experience
    
    console.log('Monetag BLOQUEADO - usuário FREE:', location.pathname);
    console.log('Motivo: Anúncios popup/overlay/nova guia são muito intrusivos');
    
    /* 
    // Code below is disabled - Monetag causes too many issues for free users
    // If you want to enable, uncomment:
    
    // Load Monetag script for free users (ONLY if we want minimal banner ads)
    const script = document.createElement('script');
    script.src = 'https://quge5.com/88/tag.min.js';
    script.setAttribute('data-zone', '209658');
    script.setAttribute('async', 'true');
    script.setAttribute('data-cfasync', 'false');
    script.id = 'monetag-conditional-loader';
    
    document.head.appendChild(script);

    return () => {
      // Cleanup: remove script when leaving route
      const existingScript = document.getElementById('monetag-conditional-loader');
      if (existingScript) {
        existingScript.remove();
      }
    };
    */

    return () => {
      // Cleanup - ensure no Monetag scripts are loaded
      const existingScript = document.getElementById('monetag-conditional-loader');
      if (existingScript) {
        existingScript.remove();
      }
    };
  }, [location.pathname, isPro, loading]);

  return null;
};
