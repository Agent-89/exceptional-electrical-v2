import type { MetadataRoute } from 'next';
import { services } from '@/lib/services';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://exceptional-electrical-v2.vercel.app').replace(/\/$/, '');
  const updated = new Date();
  return [
    { url: base, lastModified: updated, changeFrequency: 'monthly', priority: 1 },
    ...Object.keys(services).map((slug) => ({
      url: `${base}/services/${slug}`,
      lastModified: updated,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
  ];
}
