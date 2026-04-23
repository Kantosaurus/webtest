export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
} as const;

export const HSTS_HEADER = {
  name: 'Strict-Transport-Security',
  value: 'max-age=31536000; includeSubDomains; preload',
} as const;
