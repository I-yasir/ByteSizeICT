import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/lib/i18n/request.ts');

const isDev = process.env.NODE_ENV !== 'production';

/** TRD §10.9. Dev additionally needs eval (React Refresh), websockets (HMR) and local Supabase. */
const contentSecurityPolicy = [
  "default-src 'self'",
  `img-src 'self' data: blob: https://*.supabase.co${isDev ? ' http://127.0.0.1:54321' : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://va.vercel-scripts.com`,
  "font-src 'self' data:",
  `connect-src 'self' https://*.supabase.co https://va.vercel-scripts.com${isDev ? ' ws: http://127.0.0.1:54321' : ''}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // exceljs → unzipper → fstream requires rimraf, which pnpm does not hoist; load exceljs from node_modules.
  serverExternalPackages: ['exceljs'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
