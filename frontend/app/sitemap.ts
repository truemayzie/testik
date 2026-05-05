export const revalidate = 3600

import { MetadataRoute } from 'next'
import { getAllSeoPages } from '@/lib/seo-pages'
import { prisma } from '@/lib/prisma'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [seoPages, publicGenerations] = await Promise.all([
    getAllSeoPages(),
    prisma.generation.findMany({
      where: { isPublic: true, slug: { not: null } },
      select: { slug: true, createdAt: true },
    }),
  ])

  const staticPages = [
    { url: 'https://ref-ai.ru', lastModified: new Date(), changeFrequency: 'weekly' as const, priority: 1 },
    { url: 'https://ref-ai.ru/oferta', lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.3 },
    { url: 'https://ref-ai.ru/privacy', lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.3 },
    { url: 'https://ref-ai.ru/terms', lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.3 },
  ]

  const hubPages = ['referat', 'kursovaya', 'esse', 'doklad', 'vkr', 'sochinenie'].map((wt) => ({
    url: `https://ref-ai.ru/${wt}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.9,
  }))

  const commercialLanding = [
    {
      url: 'https://ref-ai.ru/kursovaya-zakaz',
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.92,
    },
    {
      url: 'https://ref-ai.ru/vkr-zakaz',
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.92,
    },
  ]

  const seoPageUrls = seoPages.map((page) => ({
    url: `https://ref-ai.ru/${page.workType}/${page.slug}`,
    lastModified: page.createdAt,
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }))

  const previewUrls = publicGenerations.map((gen) => ({
    url: `https://ref-ai.ru/preview/${gen.slug}`,
    lastModified: gen.createdAt,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }))

  return [...staticPages, ...hubPages, ...commercialLanding, ...seoPageUrls, ...previewUrls]
}
