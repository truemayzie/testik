# SEO-аудит ref-ai — 2026-04-09

---

## 1. robots.ts / robots.txt

Файл: `frontend/app/robots.ts` (генерируется Next.js динамически → `/robots.txt`)  
Статический `public/robots.txt` — **отсутствует** (и не нужен, Next.js генерирует).

```
User-agent: *
Allow: /
Disallow: /api/
Disallow: /preview/
Disallow: /dashboard/
Disallow: /profile/
Disallow: /payment/
Disallow: /auth/
Disallow: /*?workType=

Sitemap: https://ref-ai.ru/sitemap.xml
Host: https://ref-ai.ru
```

**Проблемы:**
- `/preview/` закрыт от индексации — это SEO-страницы публичных предпросмотров работ.
  Если хотим индексировать `/preview/[slug]` — надо убрать из Disallow.
- `/*?workType=` — правильно, чтобы не индексировать параметры главной страницы.

---

## 2. sitemap.ts

Файл: `frontend/app/sitemap.ts`

```ts
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const seoPages = await getAllSeoPages()

  const staticPages = [
    { url: 'https://ref-ai.ru',          changeFrequency: 'weekly',  priority: 1   },
    { url: 'https://ref-ai.ru/oferta',   changeFrequency: 'monthly', priority: 0.3 },
    { url: 'https://ref-ai.ru/privacy',  changeFrequency: 'monthly', priority: 0.3 },
    { url: 'https://ref-ai.ru/terms',    changeFrequency: 'monthly', priority: 0.3 },
  ]

  const seoPageUrls = seoPages.map((page) => ({
    url: `https://ref-ai.ru/${page.workType}/${page.slug}`,
    lastModified: page.createdAt,
    changeFrequency: 'monthly',
    priority: 0.8,
  }))

  return [...staticPages, ...seoPageUrls]
}
```

**Итог:** Sitemap формируется динамически. При 341 SeoPage → 345 URL в sitemap.  
**Проблемы:**
- `/preview/[slug]` не включён в sitemap (но и закрыт в robots — логично, если так задумано).
- Нет страниц хабов по типу работы (`/referat`, `/kursovaya` и т.д.) — если таких страниц нет, ОК.
- `getAllSeoPages()` без `orderBy` — порядок недетерминированный (незначительно).

---

## 3. База данных — таблица SeoPage

### Структура модели (schema.prisma)

```prisma
model SeoPage {
  id              Int      @id @default(autoincrement())
  slug            String   @unique
  workType        String   // referat | kursovaya | esse | doklad | vkr | sochinenie
  subject         String   // История, Биология, Экономика...
  title           String   // "Реферат по истории Второй мировой войны"
  metaTitle       String   // для <title>
  metaDescription String   // для <meta description>
  previewText     String   // 300-500 символов тизерного текста
  createdAt       DateTime @default(now())
}
```

**Нет полей:** `updatedAt`, `h1`, `bodyText` (полный текст), `relatedSlugs`, `pageViews`.

### Количество записей: **341**

### Распределение по типам работ

| workType   | Количество |
|------------|-----------|
| referat    | 111       |
| kursovaya  | 80        |
| esse       | 60        |
| doklad     | 39        |
| vkr        | 39        |
| sochinenie | 12        |
| **Итого**  | **341**   |

### Топ-15 предметов

| subject        | Количество |
|----------------|-----------|
| Экономика      | 22        |
| История        | 21        |
| Психология     | 17        |
| Философия      | 16        |
| Социология     | 16        |
| Литература     | 15        |
| Педагогика     | 14        |
| Экология       | 13        |
| Право          | 13        |
| Химия          | 12        |
| Культурология  | 12        |
| Физика         | 11        |
| Менеджмент     | 11        |
| Медицина       | 11        |
| Маркетинг      | 11        |

### Первые 10 записей

| id | slug | workType | subject | title |
|----|------|----------|---------|-------|
| 1 | vtoraya-mirovaya-vojna | referat | История | Реферат по истории: Вторая мировая война |
| 2 | rynochnaya-ekonomika | kursovaya | Экономика | Курсовая работа: Рыночная экономика |
| 3 | globalizaciya | esse | Обществознание | Эссе по обществознанию: Глобализация |
| 4 | pervaya-mirovaya-vojna | referat | История | Реферат по истории: Первая мировая война |
| 5 | fotosintez | referat | Биология | Реферат по биологии: Фотосинтез |
| 6 | periodicheskaya-tablitsa-mendeleeva | referat | Химия | Реферат по химии: Периодическая таблица Менделеева |
| 7 | kvantovaya-mekhanika | referat | Физика | Реферат по физике: Квантовая механика |
| 8 | inflyaciya | referat | Экономика | Реферат по экономике: Инфляция |
| 9 | konstitutsiya-rf | referat | Право | Реферат по праву: Конституция РФ |
| 10 | soznanie-i-bytie | referat | Философия | Реферат по философии: Сознание и бытие |

---

## 4. База данных — публичные генерации (Generation)

### Структура модели

```prisma
model Generation {
  id        String   @id @default(cuid())
  userId    String
  createdAt DateTime @default(now())
  topic     String
  pages     Int
  workType  String   @default("Реферат")
  status    String   @default("completed")
  result    String   // JSON
  isPublic  Boolean  @default(true)
  slug      String?  @unique        // 12-символьный hex, напр. "57cf6b6d7474"
  extras    String?  // JSON: {"presentation":"job_id","speech":"job_id"}
  user User @relation(...)
}
```

**Количество записей с isPublic=true:** **7**

### Первые 5 публичных генераций

| id | slug | createdAt | extras |
|----|------|-----------|--------|
| cmndo7jaq0002e965rads7v0g | 57cf6b6d7474 | 2026-03-30 20:58 | null |
| cmneenhwl000om85k9i1bfwzm | 615ed235197e | 2026-03-31 09:19 | {"presentation":"b90a5671...","speech":"b90a5671..."} |
| cmneogd3h000774zof2rbpdy0 | 88171383c4df | 2026-03-31 13:53 | {"presentation":"d66eb5bc...","speech":"d66eb5bc..."} |
| cmnf0v9x900067x6j8w9fx5w7 | f259295e21f2 | 2026-03-31 19:40 | {"presentation":"f9b1fe73...","speech":"f9b1fe73..."} |
| cmnot8q3h01bhy8laknwjw6lz | 5a63c31fe155 | 2026-04-07 16:05 | {"presentation":"3e42ee2b...","speech":"3e42ee2b..."} |

**URL публичного превью:** `https://ref-ai.ru/preview/{slug}`  
Пример: `https://ref-ai.ru/preview/57cf6b6d7474`

---

## 5. Роуты SEO-страниц

### app/[workType]/[slug]/page.tsx

**Тип:** Server Component, SSG (`generateStaticParams`)  
**URL-паттерн:** `/referat/vtoraya-mirovaya-vojna`

**Что есть:**
- `generateStaticParams()` — статическая генерация всех 341 страниц
- `generateMetadata()` — `<title>`, `<meta description>`, `<link rel="canonical">`
- Structured Data: `BreadcrumbList` + `Article` (JSON-LD)
- Хлебные крошки
- Превью-текст с fade-блюром
- CTA-блок с кнопкой «Сгенерировать работу →»

**Проблемы/пробелы:**
- Breadcrumb второй уровень (`/referat`) ссылается на `/referat` — этой страницы **нет** (нет хаб-страниц по типу)
- `previewFade` — блюр захардкожен под светлый фон (`#ffffff`). При тёмной теме будет белый блок.
- `GenerateButton` отправляет на `/` без передачи `workType` — пользователь теряет контекст
- Нет `datePublished` / `dateModified` в JSON-LD Article
- Нет `wordCount`, `author` в Article schema
- Нет Open Graph / Twitter Card тегов
- `previewText` — всего 300-500 символов, очень мало контента для SEO

### app/preview/[slug]/page.tsx

**Тип:** Server Component, SSR (нет `generateStaticParams`)  
**URL-паттерн:** `/preview/57cf6b6d7474`

**Что есть:**
- `generateMetadata()` — динамический title/description/OG на основе данных генерации
- Полный контент для владельца, частичный (блюр) для гостей
- Скачивание DOCX через `/api/preview/[slug]/download`

**Проблемы/пробелы:**
- **Закрыт в robots.txt** (`Disallow: /preview/`) — не индексируется вообще
- Нет structured data (JSON-LD)
- Нет canonical URL
- Нет `generateStaticParams` — ISR/SSR при каждом запросе
- `revalidate: 3600` при `fetchPreview` — кэш 1 час, но без ISR страница рендерится заново при каждом запросе от пользователя
- CTA-кнопка захардкожена: «Скачать DOCX — 199 ₽» — неверная цена для не-Реферата

---

## 6. lib/seo-pages.ts

```ts
export async function getAllSeoPages() {
  return prisma.seoPage.findMany()   // без limit, без orderBy
}

export async function getSeoPageBySlug(slug: string) {
  return prisma.seoPage.findUnique({ where: { slug } })
}

export async function getSeoPagesByType(workType: string) {
  return prisma.seoPage.findMany({ where: { workType } })
}
```

**Проблемы:**
- `getAllSeoPages()` грузит все 341 записей при каждом билде — при росте до 10k+ будет медленно
- `getSeoPagesByType()` есть, но нигде не используется (нет хаб-страниц `/referat`, `/kursovaya`)

---

## 7. Итоговая карта SEO-инфраструктуры

```
/                            ← главная, priority 1.0, индексируется
/referat/[slug]              ← 111 SEO-страниц, SSG, JSON-LD, canonical ✓
/kursovaya/[slug]            ← 80 SEO-страниц, SSG ✓
/esse/[slug]                 ← 60 SEO-страниц, SSG ✓
/doklad/[slug]               ← 39 SEO-страниц, SSG ✓
/vkr/[slug]                  ← 39 SEO-страниц, SSG ✓
/sochinenie/[slug]           ← 12 SEO-страниц, SSG ✓
/preview/[slug]              ← 7 публичных генераций, SSR, ЗАКРЫТ в robots ✗
/referat                     ← НЕ СУЩЕСТВУЕТ (хаб-страница) ✗
/kursovaya                   ← НЕ СУЩЕСТВУЕТ ✗
/esse, /doklad, /vkr...      ← НЕ СУЩЕСТВУЕТ ✗
/sitemap.xml                 ← 345 URL ✓
/robots.txt                  ← сгенерирован Next.js ✓
```

---

## 8. Критические пробелы (приоритет)

### P0 — блокируют трафик
1. **Нет хаб-страниц** `/referat`, `/kursovaya` и т.д. — ссылки в breadcrumb ведут в никуда (404). Высокочастотные запросы «реферат по истории», «курсовая по экономике» некуда направить.
2. **`/preview/` закрыт в robots** — 7 страниц с реальным контентом не индексируются.

### P1 — снижают качество
3. **Мало контента** на SEO-страницах: только previewText (300-500 символов) + CTA. Google нужно 500+ слов для ранжирования информационных страниц.
4. **GenerateButton** отправляет на `/` без `?workType=X` — пользователь теряет контекст воронки.
5. **Неверная цена в CTA** на `/preview/` — «199 ₽» для всех типов работ.

### P2 — улучшения
6. Нет `FAQPage` JSON-LD на главной (FAQ секция есть в HTML).
7. Нет `Product`/`Service` schema с `offers` (цены).
8. Нет `WebSite` schema с `SearchAction` на главной.
9. `lastModified` в sitemap — `createdAt`, не `updatedAt` (нет поля updatedAt у SeoPage).
10. Нет OG-image по умолчанию.

---

## 9. Файловая структура SEO

```
frontend/
├── app/
│   ├── robots.ts                          ← /robots.txt
│   ├── sitemap.ts                         ← /sitemap.xml (341 SEO + 4 static)
│   ├── [workType]/
│   │   └── [slug]/
│   │       ├── page.tsx                   ← SSG, JSON-LD BreadcrumbList+Article
│   │       └── seo-page.module.css
│   └── preview/
│       └── [slug]/
│           ├── page.tsx                   ← SSR, generateMetadata, OG
│           ├── PreviewClient.tsx
│           └── preview.module.css
├── lib/
│   └── seo-pages.ts                       ← getAllSeoPages / getSeoPageBySlug / getSeoPagesByType
└── prisma/
    └── schema.prisma                      ← SeoPage model (341 записей)
```
