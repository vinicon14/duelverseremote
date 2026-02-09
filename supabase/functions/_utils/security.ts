// Security utilities for Supabase Edge Functions
// These utilities add security headers and input validation without changing functionality

// Security headers (non-functional - doesn't affect behavior)
export const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

// UUID validation regex
export const isValidUUID = (id: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

// Validate UUID and return error response if invalid
export const validateUUID = (id: string, fieldName: string): Response | null => {
  if (!id || !isValidUUID(id)) {
    return new Response(
      JSON.stringify({ error: `Invalid ${fieldName} format` }),
      {
        status: 400,
        headers: {
          ...securityHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
  return null;
};

// Sanitize string input (trim and limit length)
export const sanitizeString = (input: unknown, maxLength: number = 255): string => {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, maxLength);
};

// Validate request body is an object
export const validateRequestBody = (body: unknown, requiredFields: string[]): Response | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return new Response(
      JSON.stringify({ error: 'Invalid request body' }),
      {
        status: 400,
        headers: { ...securityHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  for (const field of requiredFields) {
    if (!(body as Record<string, unknown>)[field]) {
      return new Response(
        JSON.stringify({ error: `Missing required field: ${field}` }),
        {
          status: 400,
          headers: { ...securityHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  }

  return null;
};

// Safe error handler - logs full error internally but returns generic message
export const handleError = (error: unknown, context: string): Response => {
  const errorId = crypto.randomUUID().slice(0, 8); // Generate safe error ID for logging
  console.error(`[${context}] Error ${errorId}:`, error);

  return new Response(
    JSON.stringify({
      error: 'An unexpected error occurred',
      errorId, // Safe to share - only used for support reference
    }),
    {
      status: 500,
      headers: { ...securityHeaders, 'Content-Type': 'application/json' },
    }
  );
};

// Rate limiting placeholder - implement at application level
// This doesn't change functionality but documents where rate limiting should be
export const checkRateLimit = (_identifier: string): boolean => {
  // TODO: Implement rate limiting using Redis or Supabase database
  // For now, always allow (doesn't break existing functionality)
  return true;
};
