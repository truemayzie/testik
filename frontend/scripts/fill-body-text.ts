/**
 * Наполняет SeoPage.bodyText через Claude API.
 *
 * Запуск: npm run fill-seo
 * API-ключ читается из backend/.env (ANTHROPIC_API_KEY) или из
 * переменной окружения ANTHROPIC_API_KEY — не нужно дублировать ключ.
 */

import path from 'path'
import fs from 'fs'
import readline from 'readline'
import Anthropic from '@anthropic-ai/sdk'
import { PrismaClient } from '@prisma/client'
import { config as dotenvConfig } from 'dotenv'

// ── Загружаем ENV ────────────────────────────────────────────────────────────
// 1. Сначала frontend/.env.local (DATABASE_URL и пр.)
dotenvConfig({ path: path.resolve(__dirname, '../.env.local') })
// 2. Затем backend/.env — за ANTHROPIC_API_KEY (не перезаписывает уже загруженные)
const backendEnvPath = path.resolve(__dirname, '../../backend/.env')
if (fs.existsSync(backendEnvPath)) {
  dotenvConfig({ path: backendEnvPath, override: false })
}

// ── Константы ────────────────────────────────────────────────────────────────
const MODEL            = 'claude-sonnet-4-5'
const MAX_TOKENS       = 1000
const PAUSE_MS         = 500
const INPUT_TOKENS     = 200   // примерная оценка
const OUTPUT_TOKENS    = 800   // примерная оценка
const INPUT_PRICE_USD  = 0.000003   // за токен
const OUTPUT_PRICE_USD = 0.000015   // за токен
const USD_TO_RUB       = 90

const WORK_TYPE_LABELS: Record<string, string> = {
  referat:    'реферат',
  kursovaya:  'курсовая работа',
  esse:       'эссе',
  doklad:     'доклад',
  vkr:        'выпускная квалификационная работа (ВКР)',
  sochinenie: 'сочинение',
}

// ── Инициализация ────────────────────────────────────────────────────────────
const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  console.error('❌  ANTHROPIC_API_KEY не найден.')
  console.error('    Добавьте ключ в backend/.env или экспортируйте переменную окружения.')
  process.exit(1)
}

const anthropic = new Anthropic({ apiKey })
const prisma    = new PrismaClient()

// ── Helpers ──────────────────────────────────────────────────────────────────
function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()) }))
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function buildPrompt(workType: string, subject: string, title: string): string {
  const label = WORK_TYPE_LABELS[workType] ?? workType
  return `Напиши экспертный текст (800–1000 символов) для SEO-страницы.
Тип работы: ${label}, Предмет: ${subject}, Тема: ${title}

Требования:
- Без воды и общих слов
- 2–3 абзаца: зачем пишут эту работу, что должно быть в содержании, типичные ошибки
- Естественно используй ключевые слова: ${title}, ${label} по ${subject}
- Не упоминай конкретные сервисы или цены

Только текст, без заголовков и markdown. Абзацы разделяй пустой строкой.`
}

// ── Основная логика ──────────────────────────────────────────────────────────
async function main() {
  // Страницы без bodyText
  const pages = await prisma.seoPage.findMany({
    where: { bodyText: '' },
    orderBy: { id: 'asc' },
  })

  const total = pages.length
  if (total === 0) {
    console.log('✅  Все страницы уже заполнены. Нечего делать.')
    await prisma.$disconnect()
    return
  }

  // Расчёт стоимости
  const costUsd = (INPUT_TOKENS * INPUT_PRICE_USD + OUTPUT_TOKENS * OUTPUT_PRICE_USD) * total
  const costRub  = costUsd * USD_TO_RUB

  console.log('\n─────────────────────────────────────────────')
  console.log(`  📄  Страниц к обработке : ${total}`)
  console.log(`  🤖  Модель              : ${MODEL}`)
  console.log(`  💵  Стоимость (оценка)  : $${costUsd.toFixed(4)} ≈ ${costRub.toFixed(0)} ₽`)
  console.log(`  ⏱   Примерное время     : ${Math.ceil(total * (PAUSE_MS + 3000) / 60000)} мин.`)
  console.log('─────────────────────────────────────────────\n')

  const answer = await ask('Продолжить? (y/n): ')
  if (answer.toLowerCase() !== 'y') {
    console.log('Отменено.')
    await prisma.$disconnect()
    return
  }
  console.log()

  let processed = 0
  let errors    = 0
  let totalInputTokens  = 0
  let totalOutputTokens = 0

  for (let i = 0; i < pages.length; i++) {
    const page    = pages[i]
    const index   = `[${i + 1}/${total}]`

    try {
      const message = await anthropic.messages.create({
        model:      MODEL,
        max_tokens: MAX_TOKENS,
        messages:   [{ role: 'user', content: buildPrompt(page.workType, page.subject, page.title) }],
      })

      const bodyText = (message.content[0] as { type: string; text: string }).text.trim()

      await prisma.seoPage.update({
        where: { id: page.id },
        data:  { bodyText },
      })

      totalInputTokens  += message.usage.input_tokens
      totalOutputTokens += message.usage.output_tokens
      processed++
      console.log(`✓ ${index} ${page.slug}`)
    } catch (err: unknown) {
      errors++
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`✗ ${index} ${page.slug} — ERROR: ${msg}`)
    }

    if (i < pages.length - 1) await sleep(PAUSE_MS)
  }

  // Итог
  const realCostUsd = (totalInputTokens * INPUT_PRICE_USD + totalOutputTokens * OUTPUT_PRICE_USD)
  const realCostRub = realCostUsd * USD_TO_RUB

  console.log('\n─────────────────────────────────────────────')
  console.log(`  ✅  Обработано  : ${processed}`)
  console.log(`  ❌  Ошибок      : ${errors}`)
  console.log(`  📊  Токены      : input ${totalInputTokens}, output ${totalOutputTokens}`)
  console.log(`  💵  Реальная стоимость: $${realCostUsd.toFixed(4)} ≈ ${realCostRub.toFixed(0)} ₽`)
  console.log('─────────────────────────────────────────────\n')

  await prisma.$disconnect()
}

main().catch(async err => {
  console.error('Fatal:', err)
  await prisma.$disconnect()
  process.exit(1)
})
