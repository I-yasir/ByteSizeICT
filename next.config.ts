import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/lib/i18n/request.ts');

const isDev = process.env.NODE_ENV !== 'production';
// The project's own Storage origin: covered by *.supabase.co in production, but a local stack
// (dev, `next start` in E2E) serves signed image and upload URLs from http://127.0.0.1:54321.
const supabaseOrigin = (() => {
  try {
    const origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin;
    return origin.endsWith('.supabase.co') ? '' : ` ${origin}`;
  } catch {
    return '';
  }
})();

/** TRD §10.9. Dev additionally needs eval (React Refresh) and websockets (HMR). */
const contentSecurityPolicy = [
  "default-src 'self'",
  `img-src 'self' data: blob: https://*.supabase.co${supabaseOrigin}`,
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://va.vercel-scripts.com`,
  "font-src 'self' data:",
  `connect-src 'self' https://*.supabase.co${supabaseOrigin} https://va.vercel-scripts.com${isDev ? ' ws:' : ''}`,
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
  // Opt-in for bundle analysis (P4.20); never enabled in normal builds.
  productionBrowserSourceMaps: process.env.ANALYZE_SOURCEMAPS === '1',
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
