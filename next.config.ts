import path from 'path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Parent folder has a stray package-lock.json; pin tracing/root to this app.
  outputFileTracingRoot: path.join(__dirname),
  // Optional separate build output so `next build` can run while `next dev` holds `.next`.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  reactStrictMode: true,
  async redirects() {
    return [
      { source: '/hq/tech', destination: '/field', permanent: true },
      { source: '/hq/tech/:path*', destination: '/field/:path*', permanent: true },
    ];
  },
  experimental: {
    // Keep recently visited dynamic HQ pages warm so sidebar back/forward feels instant.
    // Mutations still call revalidatePath / router.refresh to bust the cache.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
