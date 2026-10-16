// Временная проверка: сколько SeoPage в Postgres по типам работ
import { PrismaClient } from '@prisma/client'

const p = new PrismaClient()

async function main() {
  const c = await p.seoPage.count()
  console.log('SeoPage rows:', c)
  const types = await p.seoPage.groupBy({ by: ['workType'], _count: true })
  console.log(JSON.stringify(types, null, 2))
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => p.$disconnect())
