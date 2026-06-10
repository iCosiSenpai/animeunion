import type { NextConfig } from 'next';

const apiUrl = process.env.API_URL ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@animeunion/shared'],
  async rewrites() {
    return [{ source: '/trpc/:path*', destination: `${apiUrl}/trpc/:path*` }];
  },
};

export default nextConfig;
