import path from 'node:path';
import type { NextConfig } from 'next';

const apiUrl = process.env.API_URL ?? 'http://127.0.0.1:3001';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@animeunion/shared'],
  // Output autocontenuto per Docker (server.js + node_modules tracciati).
  output: 'standalone',
  // In monorepo: traccia i file dalla root, non solo da apps/web.
  outputFileTracingRoot: path.join(process.cwd(), '..', '..'),
  async rewrites() {
    return [{ source: '/trpc/:path*', destination: `${apiUrl}/trpc/:path*` }];
  },
  // Header di sicurezza di base (no CSP stretta: richiederebbe nonce con Next).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
