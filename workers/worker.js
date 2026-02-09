/**
 * Cloudflare Worker - Edge-level Ad Blocking
 * 
 * This worker blocks ad requests at the edge before they reach the client.
 * 
 * Deploy: wrangler deploy --env production
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const userAgent = request.headers.get('user-agent') || '';
    const referer = request.headers.get('referer') || '';

    // Ad domains to block at edge
    const adDomains = [
      // Monetag and related
      'monetag.com',
      'momntx.com',
      'mts.ru',
      'mnpt.net',
      'publishers.monetag.com',
      's.mnpt.net',
      's.mts.ru',
      'cdn.mnpt.net',
      
      // Google Ads
      'googlesyndication.com',
      'googleadservices.com',
      'doubleclick.net',
      'pagead2.googlesyndication.com',
      'adservice.google.com',
      
      // Quge5
      'quge5.com',
      's.quge5.com',
      'cdn.quge5.com',
      
      // Other ad networks
      'adnow.com',
      'admixer.com',
      'adform.com',
      'criteo.com',
      'taboola.com',
      'outbrain.com',
      'revcontent.com',
      'popads.net',
      'popunder.net',
      'propellerads.com',
      'adskeeper.co',
      'exoclick.com',
      'trafficjunky.com',
      'juicyads.com',
      
      // Analytics (optional - block if needed)
      'google-analytics.com',
      'analytics.google.com',
    ];

    // Check if request is to an ad domain
    const isAdDomain = adDomains.some(domain => url.hostname.includes(domain));

    // Check if URL path contains ad-related keywords
    const adPathPatterns = [
      '/ads/', '/ad/', '/ads?', '/ad?', '/_ads',
      '/pixel', '/track', '/click', '/open',
      '/pop', '/popup', '/interstitial',
    ];
    
    const isAdPath = adPathPatterns.some(pattern => 
      url.pathname.toLowerCase().includes(pattern)
    );

    // Block ad requests at edge
    if (isAdDomain || isAdPath) {
      console.log(`🛑 Edge blocked: ${url.href}`);
      
      // Return empty response
      return new Response('', {
        status: 204,
        statusText: 'No Content',
      });
    }

    // Continue with original request for non-ad content
    try {
      const response = await fetch(request);
      
      // Add security headers
      const newHeaders = new Headers(response.headers);
      newHeaders.set('X-Content-Type-Options', 'nosniff');
      newHeaders.set('X-Frame-Options', 'DENY');
      newHeaders.set('X-XSS-Protection', '1; mode=block');
      
      // If response is HTML and user is Pro, inject ad-blocking script
      if (
        response.headers.get('content-type')?.includes('text/html') &&
        !userAgent.includes('bot') &&
        !userAgent.includes('crawler') &&
        !userAgent.includes('spider')
      ) {
        let body = await response.text();
        
        // Inject Pro user detection and ad blocking
        const blockingScript = `
<script>
(function() {
  'use strict';
  
  // Block ad domains at edge
  const blockedDomains = ['monetag', 'quge5', 'googlesyndication', 'doubleclick'];
  
  // Override fetch
  const originalFetch = window.fetch;
  window.fetch = function(url) {
    if (typeof url === 'string' && blockedDomains.some(d => url.includes(d))) {
      console.log('🛑 Blocked:', url);
      return new Response('', {status: 204});
    }
    return originalFetch.apply(this, arguments);
  };
  
  // Override XMLHttpRequest
  const XHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function() {
    const xhr = new XHR();
    const open = xhr.open;
    xhr.open = function(method, url) {
      if (blockedDomains.some(d => url.includes(d))) {
        console.log('🛑 XHR Blocked:', url);
        return;
      }
      return open.apply(this, arguments);
    };
    return xhr;
  };
  
  // Detect Pro user and block
  function blockAds() {
    if (window.isProUser === true) {
      console.log('🛑 PRO USER - Blocking all ads');
      
      // Remove any existing ad elements
      document.querySelectorAll('iframe, script[src*="ads"], script[src*="monetag"], script[src*="quge5"]').forEach(el => el.remove());
      
      // Block all iframes
      const style = document.createElement('style');
      style.textContent = 'iframe { display: none !important; width: 0 !important; height: 0 !important; position: absolute !important; left: -9999px !important; }';
      document.head.appendChild(style);
    }
  }
  
  // Run checks
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', blockAds);
  } else {
    blockAds();
  }
  
  setInterval(blockAds, 2000);
})();
</script>
`;
        
        // Inject before </head>
        body = body.replace('</head>', blockingScript + '</head>');
        
        return new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      }
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
      
    } catch (error) {
      console.error('Worker error:', error);
      return new Response('Error', { status: 500 });
    }
  },
};
