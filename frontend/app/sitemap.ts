import { MetadataRoute } from 'next'
import { getAllSeoPages } from '@/lib/seo-pages'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const seoPages = await getAllSeoPages()

  const staticPages = [
    { url: 'https://ref-ai.ru', lastModified: new Date(), changeFrequency: 'weekly' as const, priority: 1 },
    { url: 'https://ref-ai.ru/oferta', lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.3 },
    { url: 'https://ref-ai.ru/privacy', lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.3 },
    { url: 'https://ref-ai.ru/terms', lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.3 },
  ]

  const seoPageUrls = seoPages.map((page) => ({
    url: `https://ref-ai.ru/${page.workType}/${page.slug}`,
    lastModified: page.createdAt,
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }))

  return [...staticPages, ...seoPageUrls]
}
