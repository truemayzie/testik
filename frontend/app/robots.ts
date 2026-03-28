import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/preview/', '/dashboard/', '/profile/', '/payment/', '/auth/'],
      },
    ],
    sitemap: 'https://ref-ai.ru/sitemap.xml',
    host: 'https://ref-ai.ru',
  }
}
