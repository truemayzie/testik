# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Always respond in Russian. Всегда отвечай на русском языке.

## Что это

Сервис генерации учебных работ (рефераты, курсовые, ВКР, эссе, доклады, сочинения) с оформлением по ГОСТ, авторизацией, оплатой через ЮКассу и дополнительными материалами (презентация + текст выступления).

**Стек:** Next.js 14 + TypeScript + NextAuth.js + Prisma (SQLite) | FastAPI + python-docx + python-pptx + Claude API (claude-sonnet-4-5)

## Команды

```bash
# Backend (порт 8000) — из папки backend/
source venv/bin/activate
uvicorn main:app --reload          # для разработки
uvicorn main:app                   # для prod/тестирования генерации (БЕЗ --reload!)

# Frontend (порт 3000) — из папки frontend/
npm run dev
npm run build

# Prod (pm2)
pm2 restart backend
pm2 restart frontend

# БД — останови dev-сервер перед db:push (блокирует .dll на Windows)
npm run db:push      # применить схему
npm run db:studio    # GUI Prisma Studio
```

## Архитектура: поток основной генерации (воронка `/order`)

```
Пользователь на главной вводит тему + выбирает тип работы
→ handleSubmit → openOrderPage()
→ Не авторизован → /auth/signin?callbackUrl=/order + pendingOrderDraft в sessionStorage
→ Авторизован → POST /api/tasks → PreviewTask в БД → redirect /order/[taskId]
→ OrderPageClient: PaymentWidget (режим страницы, не модалка)
   - GET /api/generate/preview — содержание + фрагмент текста (редактируемое TOC)
   - Сочинение/Эссе: без блока «Содержание», заголовок «Основная часть»
→ POST /api/payment/create → ЮKassa (embedded/СБП) или Robokassa или dev-succeeded
→ Успешная оплата → /payment/success → polling /api/payment/status → redirect /order/[taskId]?autoGenerate=1
→ OrderPageClient → useClientGeneration / OrderGenerationAside
→ POST /api/generate { topic, workType, pages, structure?, taskId } → Payment (usedAt) → FastAPI job
→ Generation создаётся сразу status=running; в extras JSON пишется `_taskId` для связи с PreviewTask
→ frontend поллит GET /api/generate/poll?generationId=... каждые 5с
→ FastAPI: generator.py → JSON; опционально custom_structure из превью
→ poll при done → saveGeneration → OrderDoneView (DOCX-превью, extras, скачивание)
→ sessionStorage: orderGenerationSession (phase: checkout | generating | done)
```

**Legacy `/order` без id:** `OrderBootstrap.tsx` читает `pendingOrderDraft` / query → создаёт task → `/order/[id]`.

**Legacy редиректы:** `/tasks/[id]` и `/tasks/pending` → `/order/...`. Старый `/payment` удалён (остался `/payment/success`).

**Dev-режим без ЮКассы:** если `YOKASSA_SHOP_ID` пуст, `/api/payment/create` создаёт платёж со статусом `succeeded` автоматически.

**Nginx:** `location /api/tasks` → Next.js :3000 (ПЕРЕД fallback `/api/` → FastAPI).

## Архитектура: поток генерации допматериалов (Extras)

```
После завершения основной генерации → пользователь видит toggles (Презентация / Текст выступления)
→ выбирает, нажимает «Заказать за X ₽»
→ POST /api/payment/extras → создаёт Payment (тип "extras"), ЮКасса или dev-succeeded
→ POST /api/generate/extras { topic, work_type, items, result, profile }
→ FastAPI POST /api/generate/extras → запускает generate_presentation / generate_speech в потоке
→ возвращает { extrasJobId }
→ frontend поллит GET /api/generate/extras/status/{extrasJobId} (force-dynamic, cache: no-store!)
→ по готовности PATCH /api/generations/{id}/extras { extras: {"presentation": jobId, "speech": jobId} }
→ файлы: /tmp/pptx_{jobId}.pptx, /tmp/speech_{jobId}.docx
→ скачать: GET /api/download/presentation/{jobId}, GET /api/download/speech/{jobId}
```

**Важно:** статус-эндпоинт `/api/generate/extras/status/[extrasJobId]/route.ts` ОБЯЗАН иметь `export const dynamic = "force-dynamic"` + `cache: "no-store"` — иначе Next.js кэширует ответ и фронтенд зависает на "Генерируем...".

**Модульный паттерн `_extras`:** polling живёт вне React lifecycle (иначе stale closure при ре-рендерах). На странице заказа генерация — через `useClientGeneration` + `orderGenerationSession` (не `_gen` на главной).

## Бэкенд (FastAPI)

### main.py
- In-memory хранилища: `_jobs` (основная генерация), `_extras_jobs` (доп. материалы)
- Слот-based лимит: `WORK_SLOTS` — вес каждого типа (Сочинение/Эссе=1, Доклад/Реферат=2, Курсовая=4, ВКР=5), `MAX_SLOTS=8` (на prod 4 GB RAM — адекватно; узкое место чаще GitHub Actions proxy и extras/PPTX, не слоты)
  - `_used_slots()` — суммирует веса запущенных заданий
  - `_available_types()` — типы, которые можно запустить прямо сейчас
  - `GET /api/slots` — публичный эндпоинт: `{used, max, available}`
  - 503 при нехватке слотов возвращает `{message, available}` — список доступных типов
- Задания: `running → done | error`. `GET /api/generate/result/{id}` **не удаляет** job; после сохранения в БД Next.js вызывает `DELETE /api/generate/job/{id}`
- **Фоновый reconciler** (`lib/generationReconciler.ts`, старт в `instrumentation.ts`): каждые 30 с дожимает `Generation` со `status=running` и `extras._jobId`, если backend уже `done` (вкладку можно закрыть). Orphan `not_found` >90 мин → `status=failed`
- Extras-задания не удаляются — нужны для повторного скачивания файлов
- Добавлена TTL-очистка файлов extras в `/tmp` (`pptx_*.pptx`, `speech_*.docx`) старше 24 часов
- `ReferatResponse` (Pydantic): `model_config = ConfigDict(extra="allow")` — в JSON ответа `/api/generate/result/{job_id}` попадает служебное поле **`_cost_usd`** из `generator.py` (оценка расхода по токенам)
- `ReferatRequest`: опциональное поле `structure: list[str] | None` — кастомное содержание из превью заказа

### generator.py
- `WORK_RULES` dict: лимиты страниц, флаги `has_title_page / has_toc / has_sources` для каждого типа
- CrossRef ищет реальные источники (только если `has_sources=True`)
- Claude API генерирует структуру и каждый раздел отдельно через тип-специфичные prompt-функции: `get_structure_prompt`, `get_intro_prompt`, `get_section_prompt`, `get_conclusion_prompt`
- `generate_referat = generate_work` — алиас для обратной совместимости

### formatter.py
- DOCX по ГОСТ. Условно добавляет: титульный лист (`has_title_page`), оглавление (`has_toc`)
- Заголовок оглавления: СОДЕРЖАНИЕ или ОГЛАВЛЕНИЕ в зависимости от типа работы
- Список литературы (`has_sources`)
- Правое поле 1.5 см для коротких форматов (Эссе, Доклад, Сочинение), 1.0 см для остальных
- Таблицы передаются как `[TABLE]{json}[/TABLE]` — парсятся во фронте и в DOCX
- Титульный лист поддерживает флаги пропуска: `skip_faculty`, `skip_speciality`, `skip_discipline` (из профиля пользователя)
- TOC: `TOC_TAB_TWIPS = 8640` (стандарт ГОСТ). Все уровни используют `effective_tab=8640` (без вычитания отступа подглав) — иначе при длинных заголовках точечный лидер не рисуется. Подглавы: `left=567`, tab всё равно 8640
- Список литературы: `w:ind left=709 hanging=709`, `w:spacing after=80` (≈4pt), выравнивание JUSTIFY, без пустых строк между источниками
- `rebuild_examples.py` — утилита хирургической пересборки TOC и библиографии в примерах DOCX без регенерации контента

### presentation_generator.py
- `generate_presentation` — `PRESENTATION_SLIDES_MODE=deterministic` (JSON из `slides_from_result.py`, без второго Claude) или `claude`
- `generate_speech` — текст выступления 3–5 мин, DOCX
- Превью слайдов на фронте: `IonPresentationPreview` + `lib/presentationSlides.ts`

### pptx_template_builder.py
- Сборка PPTX extras через **python-pptx** и шаблон `backend/tamplates/ion.pptx`
- Макеты: «Титульный», «Заголовок и объект», «Только заголовок»
- `PRESENTATION_TEMPLATE_PATH` — переопределение пути к шаблону
- **Удалено:** `pptx_builder.js`, `render_slides.js`, `presenton_client.py` (Node/presenton больше не используются для extras)

### github_proxy.py
- Прокси через GitHub Actions для обхода блокировок Claude API из РФ
- Запускается при старте FastAPI (`start_callback_server()`)
- `PROXY_SECRET` обязателен (insecure fallback удалён, при отсутствии backend падает на старте callback-сервера)
- **`POST https://api.github.com/.../dispatches`**: `requests.Session` с **`trust_env = False`** — запуск workflow **не идёт через `HTTPS_PROXY`/Privoxy**. Иначе CONNECT-туннель к GitHub периодически давал `SSLEOFError` и обрывал длинную генерацию посредине процесса.
- До **5 повторных попыток** при `SSLError`, `ConnectionError`, `Timeout`, `OSError` с нарастающей паузой.
- Ожидание callback от workflow: **до 15 минут** (GitHub Actions может стоять в очереди).

## Фронтенд (Next.js)

### Типы работ и цены (lib/prices.ts)
Единственный источник цен и диапазонов страниц. Отсортированы по возрастанию:

| Тип        | Цена    | Страниц  |
|------------|---------|----------|
| Сочинение  | 99 ₽    | 3–5      |
| Эссе       | 149 ₽   | 4–8      |
| Доклад     | 199 ₽   | 15–20    |
| Реферат    | 299 ₽   | 20–25    |
| Курсовая   | 699 ₽   | 30–40    |
| ВКР        | 1199 ₽  | 60–70    |

Extras: Презентация +199 ₽, Текст выступления +149 ₽

### Ключевые файлы фронтенда

**`app/page.tsx`** — главная (лендинг + форма заказа)
- Hero: динамический H1 через `lib/heroCopy.ts`; счётчик «Создано уже более N работ» — `GET /api/stats/works-created`
- Форма → `openOrderPage()` → `POST /api/tasks` → `/order/[id]` (генерация и оплата **не на главной**)
- Лендинг: «Почему Refai?», «Как это работает», compare, «Последние проекты», FAQ, PreFooter
- Scroll-reveal: `[data-reveal]` + IntersectionObserver
- `?autoGenerate=1` после оплаты → редирект на `/order/[taskId]?autoGenerate=1` (не на главную)

**`app/order/`** — страница заказа (Samopisets-style)
- `/order/[id]/page.tsx` → `OrderPageClient`: checkout → generating → done
- `PaymentWidget` — превью TOC/текста, blur + CTA, sticky-блок оплаты справа
- `OrderGenerationAside` — прогресс генерации; `OrderDoneView` — результат и скачивание
- `lib/pendingOrderDraft.ts`, `lib/orderGenerationSession.ts`, `lib/createOrderTask.ts`

**`app/components/Header.tsx`** — fixed + `--site-header-h`; при scroll >16px «плавающий островок»; «Мои работы» + аватар с dropdown (id копируется, «Выйти»)

**`app/components/PaymentWidget.tsx`** — checkout на странице `/order`: превью, extras-toggles, ЮKassa/Robokassa

**`lib/useClientGeneration.ts`** — хук генерации + poll (вынесен с главной)

**`app/dashboard/page.tsx`** — «Мои работы»
- Черновики «Ожидает оплаты» из `GET /api/tasks` → кнопка «Оплатить» → `/order/[id]`
- Генерации in-progress / completed — как раньше
- Журнал скачиваний: `WorkActivity`

**`app/components/TypewriterInput.tsx`** — анимированный placeholder
- Анимация через CSS-оверлей (не pixel-calc), cursor всегда вплотную к тексту

**`app/components/PreFooter.tsx`** — CTA-секция с анимированными карточками документов (якорь `#generator`)

**Удалено с главной:** `AuthModal`, `GenerationWidget`, `genState.ts`, `/payment/page.tsx` — авторизация через `/auth/signin`, checkout через `/order`

**`app/[workType]/page.tsx`** — SEO-хаб по типу работы (`/referat`, `/kursovaya` и т.д.): список тем с фильтрами, ссылки на отдельные SEO-страницы

**`app/[workType]/[slug]/page.tsx`** — SEO-страница конкретной работы: содержание (TOC), предпросмотр текста с блюром, список литературы (фрагмент), CTA с кнопкой генерации, SEO bodyText, breadcrumbs, JSON-LD (BreadcrumbList + Article). Для **`sochinenie`** и **`esse`**: компактный блок без TOC и списка литературы — заголовок предпросмотра «Фрагмент сочинения» (для эссе тот же паттерн compact), единый blur + карточка блокировки; стили в `seo-page.module.css` (`.docBlurWrapCompact`, `.compactLockCard`)

**`frontend/scripts/add-sochinenie-top5.ts`** — upsert пачки SEO-страниц «сочинение TOP-5» в Prisma (`seoPage`): slug, `previewText`, `metaDescription`, `bodyText` (запуск: `npx tsx scripts/add-sochinenie-top5.ts` из `frontend/`)

**`app/profile/page.tsx`** — профиль: поля титульника (университет, факультет, кафедра, специальность, дисциплина, курс, группа, ФИО, преподаватель, город). `GET/PATCH /api/profile`

**`app/preview/[slug]/`** — публичный предпросмотр. Гостям: первые 2 предложения + первые 3 источника. Владельцу: всё.

**`app/admin/`** — админ-панель (роль `admin`): статистика + график, управление пользователями / платежами / работами / отзывами
- `admin/feedback/page.tsx` — таблица отзывов: дата, пользователь, тема, тип, звёзды, проблемы, комментарий; фильтр по проблеме, пагинация
- Дашборд: блоки «Средний рейтинг», «Отзывов за 7 дней», «Топ проблем» с мини-барами

### API-маршруты

| Маршрут | Метод | Описание |
|---------|-------|----------|
| `/api/tasks` | GET/POST/DELETE | Черновики заказа (`PreviewTask`); POST создаёт task → `/order/[id]` |
| `/api/tasks/[id]` | GET/DELETE | Один черновик / удаление |
| `/api/generations/by-task/[taskId]` | GET | Generation по `_taskId` в extras |
| `/api/stats/works-created` | GET | Счётчик для hero (seoPage.count) |
| `/api/generate` | POST | Payment + taskId → backend job → `{status:"running", jobId, generationId}` |
| `/api/generate/poll` | GET | Поллинг статуса основной генерации; при `done` сохраняет Generation и возвращает результат |
| `/api/generate/extras` | POST | Запускает extras-генерацию через FastAPI |
| `/api/generate/extras/status/[id]` | GET | Статус extras (force-dynamic, no-store, только владелец job) |
| `/api/generations` | GET/POST | История / сохранение генерации |
| `/api/generations/[id]` | GET | Одна генерация по id |
| `/api/generations/[id]/extras` | PATCH | Сохранить job IDs доп. материалов |
| `/api/generations/recent` | GET | Последние 12 работ (публичный, без личных данных) |
| `/api/payment/create` | POST | Создать платёж (ЮКасса или dev-succeeded) |
| `/api/payment/extras` | POST | Платёж за extras |
| `/api/payment/check` | GET | Проверить наличие оплаченного платежа |
| `/api/payment/webhook` | POST | Вебхук ЮКассы |
| `/api/payment/robokassa/result` | GET/POST | ResultURL Robokassa: проверка подписи (Password#2) и перевод Payment → succeeded |
| `/api/payment/status` | GET | Получить статус Payment по id (для /payment/success) |
| `/api/download` | POST | Скачать DOCX результата; опционально `_activity` в JSON (служебное поле, вырезается до прокси на FastAPI) — запись в `WorkActivity` |
| `/api/work-activity` | POST | Fire-and-forget: фиксация PPTX/Speech download (клиент после успешного blob) |
| `/api/download/presentation/[jobId]` | GET | Прокси PPTX с бэкенда |
| `/api/download/speech/[jobId]` | GET | Прокси speech DOCX с бэкенда |
| `/api/preview/[slug]` | GET | Публичный предпросмотр |
| `/api/preview/[slug]/download` | POST | Скачать DOCX по slug (владелец); пишет `WorkActivity` с `source: preview` |
| `/api/profile` | GET/PATCH | Профиль пользователя |
| `/api/admin/*` | — | Статистика, пользователи, платежи, работы, отзывы |
| `/api/admin/work-activity` | GET | Журнал скачиваний (`?limit=`, `?email=`); только `role=admin` |
| `/api/capacity` | GET | Прокси на FastAPI `/api/slots` — текущая занятость слотов |
| `/api/gift` | GET | Проверка доступной gift-генерации (по gift payment) |
| `/api/feedback` | GET | Сохранить рейтинг из письма (`?generationId=X&rating=Y`), редирект |
| `/api/feedback/comment` | POST | Сохранить детальный отзыв (issues + comment) |

### Прогресс-бар генерации (`getProgressSteps`)
- Сочинение/Эссе: 4 шага (~60–70 с)
- Доклад: 8 шагов (~100–120 с)
- Реферат: 10 шагов (~160–180 с)
- Курсовая: 10 шагов (~220–260 с)
- ВКР: 11 шагов (~350–420 с, включая «Оформляем приложения»)

### Секция «Последние проекты» + Social proof
- `MOCK_WORKS_POOL` — 50 реалистичных работ, перемешиваются при маунте (Fisher-Yates), показываются 8
- Ротация каждые 5 минут: новая карточка сверху с анимацией + бейдж «новая», список остаётся 8 штук
- `getDailyGenCount()` — счётчик генераций за день (0→252), растёт по времени суток, обновляется каждые 37 с
- `timeAgo(minutesAgo)` — «только что» / «X мин. назад» / «X ч. назад»
- Если `/api/generations/recent` вернул ≥ 30 реальных записей — моки отключаются, ротация останавливается
- Карточки: CSS `@keyframes cardFadeUp` + nth-child stagger (появление при добавлении в DOM), строгий минималистичный стиль без полоски слева

### Иконки скачивания (`/public/`)
- `/docx-icon.png` — иконка Word для кнопок скачивания DOCX
- `/pptx-icon.svg` — иконка PowerPoint 2019 для кнопок презентации
- `/txt-icon.svg` — иконка TXT для кнопок текста выступления

### CSS-соглашения
- CSS Modules рядом с компонентами. Глобальные переменные только в `globals.css` (`--accent: #1B3A6B` — navy)
- Глобальные селекторы (`*`, `:root`) нельзя в `.module.css`
- Прогресс-карточка генерации — тёмный navy-градиент (`#061525 → #0F2645 → #1B3A6B`) с shimmer-анимацией
- Scroll-reveal: `[data-reveal]` в глобальном globals.css, `data-visible="true"` через `setAttribute` (не `classList.add` — иначе React перезаписывает className при ре-рендере). Задержки через `data-delay="1..8"`
- Анимации шагов: `[data-step-icon]` в globals.css, `stepIconPop` кейфрейм при появлении секции
- DOCX-превью: `--docx-scale` устанавливается в JS через `container.style.setProperty`. В globals.css `border-width: max(1px, calc(1px / var(--docx-scale, 1)))` — компенсирует суб-пиксельные бордеры таблиц при `transform:scale` на мобилке
- ExamplesSection: минимальный scale на мобилке 0.62 (не 0.46), `overflow-x: auto` в leftCol — оглавление читаемо

## Модели Prisma (SQLite)

- **`User`** — NextAuth + профиль титульника; `freePreviewUses`, `freePreviewQuota` (в сессии сейчас `previewAvailable: true` для всех)
- **`PreviewTask`** — черновик до оплаты: `topic`, `workType`, `pages`, `extras?`, `expiresAt` (48 ч TTL)
- **`Generation`** — `result`, `slug`, `extras` (JSON: `presentation`, `speech`, **`_taskId`**)
- **`Payment`** — `usedAt: null` = не использован; `workType` привязан к типу работы
- `provider` / `providerPaymentId`: поддержка `yookassa` и `robokassa` (Robokassa InvId хранится в `providerPaymentId`)
- **`ExtrasJob`** — ownership `extrasJobId -> userId` для защиты `/api/generate/extras/status/*`
- **`HealthCheck`** — лог проверок состояния системы
- **`SeoPage`** — SEO-страницы по типу работы + предмету
- **`FeedbackComment`** — детальный отзыв: `generationId`, `issues` (JSON-массив строк), `comment String?`
- **`WorkActivity`** — учёт скачиваний: `userId`, `generationId?`, **`action`** (`DOCX_DOWNLOAD` \| `PPTX_DOWNLOAD` \| `SPEECH_DOWNLOAD`), **`source`** (`home` \| `dashboard` \| `preview`), `slug`, `workType`, `meta?` (JSON), `createdAt`. Привязка `generationId` проверяется на сервере (владелец).

**`lib/workActivity.ts`** — `recordWorkActivity` для API-маршрутов.

**`lib/db.ts`** — `saveGeneration`, `getUserGenerations`, `getGenerationByPreviewTaskId`, …

## Авторизация (lib/auth.ts)

- Яндекс OAuth + Email magic link (Resend REST API, не SMTP)
- VK OAuth закомментирован (не планируется в ближайшее время)
- Сессии в БД (`strategy: "database"`)
- Callback URL Яндекс (prod): `https://ref-ai.ru/api/auth/callback/yandex`
- **Nginx**: `/api/feedback` (и `/api/feedback/comment`) проксируется на Next.js:3000, а не на FastAPI:8000 — отдельный `location /api/feedback` блок стоит ПЕРЕД общим `location /api/`
- `allowDangerousEmailAccountLinking: true`; redirect на `callbackUrl` после OAuth
- Secure cookies в prod (`__Secure-next-auth.*`)
- Тестовый аккаунт ЮКасса: роль `yukassa_test`, bcrypt-пароль, особые условия оплаты

## ENV

**backend/.env:**
```
ANTHROPIC_API_KEY=   # Claude API
PIXABAY_API_KEY=     # для поиска изображений в презентациях
GITHUB_TOKEN=        # для GitHub Actions прокси
GITHUB_REPO=         # owner/repo для прокси
PROXY_SECRET=        # секрет прокси
```

**frontend/.env.local:**
```
DATABASE_URL="file:./prisma/dev.db"
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=
YANDEX_CLIENT_ID=
YANDEX_CLIENT_SECRET=
RESEND_API_KEY=
EMAIL_FROM=onboarding@resend.dev
YOKASSA_SHOP_ID=        # пусто = dev-режим (платёж succeeded автоматически)
YOKASSA_SECRET_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Инфраструктура (prod-сервер)

**ОС:** Ubuntu 22.04 LTS, тариф **Cloud MSK 50** (Timeweb Cloud, Москва): 2×3.3 GHz CPU, **4 GB RAM**, **50 GB NVMe**

**Процессы (PM2):**
- `frontend` — Next.js :3000
- `backend` — uvicorn FastAPI :8000
- `tg-bot` — Telegram-бот поддержки (Python, `tg_bot/bot.py`, Aiogram)
- `vpn` — sing-box (VPN)

### Telegram
- **Бот поддержки (`tg_bot/`):** отдельный токен (`BOT_TOKEN` в `tg_bot/.env`), ответы пользователям, FAQ, пересылка вопросов админу (`ADMIN_ID`). На prod до `api.telegram.org` часто нет прямого канала — в **`tg_bot/.env`** задаётся **`TELEGRAM_HTTP_PROXY=http://127.0.0.1:8118`** (Privoxy); в venv нужен пакет **`aiohttp-socks`** (см. `tg_bot/requirements.txt`). Сессия Aiogram: таймаут 120 с, при отсутствии прокси — принудительно IPv4 для коннектора.
- **Уведомления админу о событиях сайта:** `frontend/lib/tgNotify.ts` — `TELEGRAM_BOT_TOKEN` + `TELEGRAM_ADMIN_CHAT_ID` в `frontend/.env.local` (регистрация, старт/конец генерации с `_cost_usd`, оплата). Это не тот же процесс, что `tg-bot`, но тот же класс исходящих запросов к Telegram API; при необходимости прокси для Node задаётся через `HTTPS_PROXY` в окружении процесса `frontend`.
- После правок бота: `pm2 restart tg-bot --update-env`

**Nginx:** reverse proxy для ref-ai.ru. Специфичные `location /api/foo` → Next.js:3000. Фолбэк `/api/` → FastAPI:8000.
- Обязательные Next.js-маршруты: `/api/gift`, **`/api/tasks`**, `/api/feedback`

**Proxy для исходящих запросов:** Privoxy (:8118). Backend и Claude Code используют `HTTPS_PROXY=http://127.0.0.1:8118` / `ALL_PROXY=http://127.0.0.1:8118` (прописаны в `.bashrc`). Запускать `claude` напрямую — без `proxychains4`.
- Для PM2 HTTP-процессов (`frontend`, `backend`) не использовать `LD_PRELOAD=libproxychains.so.4` (ломает OAuth/HTTP callbacks). Допустим только стандартный proxy через `HTTPS_PROXY`/`ALL_PROXY`.

**SSL:** Let's Encrypt, auto-renew certbot.

**БД:** SQLite. **Prod:** файл `frontend/prisma/prisma/dev.db` (~5 MB). В `.env`: `DATABASE_URL="file:./prisma/dev.db"` (путь относительно `schema.prisma`). Файл `frontend/prisma/dev.db` — пустышка, не использовать.

### Мини-runbook деплоя frontend
```bash
bash /var/www/ref-ai/scripts/deploy-frontend.sh
# или вручную: rm -rf .next && npm run build && pm2 restart frontend --update-env
```
После `schema.prisma` — `npm run db:push` в `frontend/` (остановить dev-сервер).

### Мини-runbook деплоя backend / бота
- После изменений в `backend/main.py` (модели ответа, эндпоинты): `pm2 restart backend --update-env`
- После `pip install` в `tg_bot/venv`: перезапуск `pm2 restart tg-bot --update-env`

## Безопасность

### Что защищено
- Все генерация-эндпоинты проходят через NextAuth (`getServerSession`) — проверка сессии + роли
- Платёжный вебхук верифицирует статус запросом к YooKassa API (не слепо доверяет payload)
- Оплата помечается `usedAt` атомарно (`updateMany` с `where: { usedAt: null }`) — защита от двойной траты
- Admin API защищён `adminGuard.ts` (role=admin из БД, не из токена)
- `/proxy-callback/` принимает только запросы с корректным `X-Proxy-Secret` заголовком
- `/api/generate/extras/status/[id]` защищён авторизацией + проверкой владельца (`ExtrasJob`)
- HTTPS enforced: HTTP (порт 80) делает 301 → HTTPS

### Security headers (nginx, HTTPS)
```
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
```

### Известные ограничения
- Rate limiting только на уровне приложения (1 активная генерация на юзера + 5 в день), не на уровне nginx
- Backend FastAPI не имеет своей аутентификации — защита обеспечивается nginx routing (специфичные locations → Next.js)
- `_extras_jobs` в памяти не очищаются автоматически (статусы extras), но временные файлы `/tmp` теперь чистятся TTL-джобом

### Изменения 2026-04-28 (security audit)
- Удалён `/etc/nginx/sites-enabled/ref-ai` — старый HTTP-конфиг с `/api/backend/` (прямой доступ к FastAPI без авторизации) и сломанным HTTPS-редиректом
- Добавлены security headers в HTTPS nginx блок
- Убран `LD_PRELOAD=libproxychains.so.4` из backend PM2-окружения — теперь используется privoxy через `HTTPS_PROXY`

## Статус реализации

- ✅ Генерация всех типов работ (Сочинение, Эссе, Доклад, Реферат, Курсовая, ВКР)
- ✅ Тип-специфичные промпты, структура и оформление (WORK_RULES)
- ✅ DOCX по ГОСТ (условные титульник/оглавление/список литературы)
- ✅ Async-генерация (jobId + polling), слот-based лимит (MAX_SLOTS=8, веса по типу работы)
- ✅ Авторизация (Яндекс + Email magic link)
- ✅ Профиль пользователя (поля для автозаполнения титульника)
- ✅ Личный кабинет + история работ с DOCX-превью (docx-preview)
- ✅ Оплата ЮКасса (включая dev-режим)
- ✅ Автогенерация после оплаты (`/order/[taskId]?autoGenerate=1` + `orderGenerationSession`)
- ✅ Воронка заказа `/order` + черновики `PreviewTask` + dashboard «Ожидает оплаты»
- ✅ PaymentWidget на странице заказа (превью + оплата + генерация)
- ✅ Header: sticky «островок» при скролле, аватар + «Мои работы»
- ✅ Дополнительные материалы: Презентация (PPTX) + Текст выступления (DOCX)
  - ✅ PPTX через **python-pptx** + шаблон `ion.pptx` (`pptx_template_builder.py`)
  - ✅ Превью слайдов: `IonPresentationPreview`
- ✅ Расширенный титульный лист: поля city, speciality, discipline + чекбоксы «не указывать» для faculty/speciality/discipline
- ✅ Social proof на лендинге: живая лента 50 работ с ротацией, счётчик генераций за день
- ✅ Публичные превью работ по slug (SEO, частичное содержимое для гостей)
- ✅ Скачивание DOCX/PPTX по slug и из результата (иконки DOCX/PPTX/TXT)
- ✅ Лендинг: «Почему Refai?», «Последние проекты», «Свежие отзывы», FAQ, PreFooter
- ✅ Раздел «Последние проекты»: реалистичные mock-данные, цветные карточки по типу, замена реальными данными при ≥ 8 работ в БД
- ✅ Админ-панель: статистика, управление пользователями/платежами/работами
- ✅ SEO-инфраструктура: хаб-страницы по типу работы (`/referat` и т.д.) + детальные страницы (`/referat/[slug]`) с JSON-LD, breadcrumbs, предпросмотром, CTA
- ✅ PaymentWidget: checkout на `/order` (ЮKassa embedded + Robokassa)
- ✅ Scroll-reveal анимации на лендинге: IntersectionObserver + data-reveal/data-visible, иконки шагов с анимацией pop
- ✅ Блок сравнения «Самостоятельно vs Refai» на лендинге (6 строк: время/оформление/источники/уникальность/стоимость/формат)
- ✅ Редизайн прогресс-бара: точки-шаги с пульсацией, тема работы, счётчик «Шаг N из M», анимированные подписи
- ✅ Деплой на prod (pm2: backend + frontend, домен ref-ai.ru)
- ✅ Система обратной связи: письмо после генерации со звёздами → `/api/feedback` сохраняет рейтинг → плохая оценка открывает модалку в dashboard с чекбоксами проблем
- ✅ Редизайн писем (magic link + уведомление о готовности): navy+amber палитра сайта, SVG-лого, `lib/email.ts`
- ✅ Умный лимит параллельных задач: слот-based (ВКР=5 слотов, Курсовая=4, Доклад/Реферат=2, Сочинение/Эссе=1, MAX_SLOTS=8). Показывает пользователю доступные типы при перегрузке
- ✅ Adminфедбек: `/admin/feedback` — таблица с фильтром/пагинацией; дашборд — avgRating, topIssues
- ✅ DOCX: подпись таблицы внутри таблицы как нулевая строка с tblHeader (не дублируется при переносе страниц)
- ✅ Защита extras status: ownership через Prisma `ExtrasJob` (устойчива к рестартам) + TTL-очистка старых ownership-записей (24ч)
- ✅ Убран long-wait в `/api/generate`: API возвращает `jobId` сразу, финализация перенесена в `/api/generate/poll`
- ✅ Безопасность proxy callback: `PROXY_SECRET` обязателен, insecure fallback удалён
- ✅ A11y-поведение модалок (без визуальных изменений): фокус внутрь, focus-trap, Escape, возврат фокуса

### Изменения 2026-05-01
- Главная: исправление гидратации счётчика «генераций сегодня» (`page.tsx`), без случайных значений в первом SSR-рендере
- Backend: `ReferatResponse` с `model_config = ConfigDict(extra="allow")` — в ответе результата сохраняется `_cost_usd` для строки стоимости в `tgNotify`
- SEO: компактное превью сочинений/эссе (фрагмент + blur + lock card), правки CSS; скрипт `add-sochinenie-top5.ts` для контента топ-страниц
- Telegram: бот поддержки через Privoxy (`TELEGRAM_HTTP_PROXY` + `aiohttp-socks`), дублирование URL текстом при «Перейти на сайт»

### Изменения 2026-05-02
- **`github_proxy.py`**: запуск GitHub Actions (`repository_dispatch`) без системного HTTPS-прокси + ретраи — устранён обрыв TLS к `api.github.com` через Privoxy на длинных работах (курсовые и т.д.).
- **Учёт скачиваний**: модель **`WorkActivity`**, `POST /api/work-activity`, запись DOCX-потоков через **`_activity`** в `POST /api/download`, серверная запись для **`POST /api/preview/[slug]/download`**, `GET /api/admin/work-activity` для поддержки (`app/lib/trackWorkActivity.ts` на клиенте для PPTX/Speech).
- Деплой: после изменения схемы — `npm run db:push` в `frontend/`; оплата и цепочка `generate → poll → saveGeneration` не затрагиваются (кроме косметики состояния `generationSlug` на главной).

### Изменения 2026-05-05
- **KZ/EN локализация генерации**: в `backend/generator.py` добавлено auto-script определение языка темы (`ru|kz|en`), локализованы служебные секции структуры (`Введение/Заключение/Список литературы`), а `Заключение` теперь генерируется на языке темы.
- **Источники для KZ**: реализован mixed-пул (KZ + RU/EN) с минимальной валидацией наличия KZ-источников и отдельной нормализацией стиля библиографии только в KZ-ветке; RU-ветка источников оставлена без изменений.
- **DOCX-локализация**: в `backend/formatter.py` добавлен выбор локализованных заголовков `TOC` и служебных разделов по `meta.doc_lang`, с canonical-сопоставлением (`intro/conclusion/sources/appendix`) для устойчивой сборки документа.
- **Реальный прогресс генерации**: backend job progress → `/api/generate/poll`; UI на `/order` через `useClientGeneration` + ETA
- **Стабилизация прогресс-бара**: убран конфликт клиентского таймера и backend-прогресса (исправлены скачки к 100% и обратно), улучшена оценка времени до конца на основе ожидаемой длительности типа работы.
- **UX-обновления**: переработана адаптивность карточки прогресса (процент + ETA + переносы), добавлена верхняя языковая промо-плашка под навигацией в стилистике сайта (`Header.tsx`, `Header.module.css`) с сохранением скрытия в `localStorage`.

### Изменения 2026-05-29
- **Воронка `/order`**: главная только лендинг + форма; checkout/превью/генерация/результат на `/order/[taskId]`; модель **`PreviewTask`**; API **`/api/tasks`**; черновики в dashboard «Ожидает оплаты».
- **PaymentWidget** — режим страницы заказа (Samopisets-style): превью TOC, blur, sticky оплата; сочинение/эссе без TOC.
- **Header**: fixed, плавающий островок при scroll, «Мои работы» у аватара, dropdown с копированием id.
- **PPTX extras**: `pptx_template_builder.py` + шаблон `ion.pptx`; удалены Node `pptx_builder.js` и Presenton client.
- **`useClientGeneration`**: генерация вынесена с главной; `orderGenerationSession` для восстановления фазы заказа.
- **Auth**: `callbackUrl` redirect, secure cookies, linking email/Yandex аккаунтов.
- **Deploy**: `scripts/deploy-frontend.sh` — `rm -rf .next` перед build (фикс 404 static chunks).
