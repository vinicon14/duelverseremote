import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Ad domains to block at edge
const AD_DOMAINS = [
  // Monetag
  'monetag.com',
  'momntx.com',
  'mts.ru',
  'mnpt.net',
  'publishers.monetag.com',
  'cdn.mnpt.net',
  
  // Quge5
  'quge5.com',
  
  // Google Ads
  'googlesyndication.com',
  'googleadservices.com',
  'doubleclick.net',
  'pagead2.googlesyndication.com',
  
  // Other ad networks
  'adnow.com',
  'admixer.com',
  'criteo.com',
  'taboola.com',
  'outbrain.com',
  'popads.net',
];

// Paths that indicate ad requests
const AD_PATHS = ['/ads/', '/ad/', '/pixel', '/track', '/click', '/popup'];

export function middleware(request: NextRequest) {
  const url = new URL(request.url);
  const hostname = url.hostname;
  const pathname = url.pathname;

  // Block requests to ad domains
  const isAdDomain = AD_DOMAINS.some(domain => hostname.includes(domain));
  
  // Block requests with ad paths
  const isAdPath = AD_PATHS.some(path => pathname.toLowerCase().includes(path));

  // Block ad requests at edge
  if (isAdDomain || isAdPath) {
    console.log(`🛑 Edge blocked: ${url.href}`);
    return new NextResponse('', {
      status: 204,
      statusText: 'No Content',
    });
  }

  // Add security headers
  const response = NextResponse.next();
  
  // Security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
}

// Only run on specific paths
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - ad-related paths (already blocked)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|ads/|ad/).*)',
  ],
};
