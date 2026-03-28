import { prisma } from './prisma'

export async function getAllSeoPages() {
  return prisma.seoPage.findMany()
}

export async function getSeoPageBySlug(slug: string) {
  return prisma.seoPage.findUnique({ where: { slug } })
}

export async function getSeoPagesByType(workType: string) {
  return prisma.seoPage.findMany({ where: { workType } })
}
