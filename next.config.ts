import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
