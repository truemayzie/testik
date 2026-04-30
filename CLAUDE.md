# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Always respond in Russian. Всегда отвечай на русском языке.

## Что это

Сервис генерации учебных работ (рефераты, курсовые, ВКР, эссе, доклады, сочинения) с оформлением по ГОСТ, авторизацией, оплатой через ЮКассу и дополнительными материалами (презентация + текст выступления).

**Стек:** Next.js 14 + TypeScript + NextAuth.js + Prisma (SQLite) | FastAPI + python-docx + Claude API (claude-sonnet-4-5) | Node.js + pptxgenjs (генерация PPTX)

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

## Архитектура: поток основной генерации

```
Пользователь вводит тему + выбирает тип работы
→ handleSubmit → GET /api/payment/check?workType=X
→ Нет платежа → sessionStorage.pendingGeneration → открывается PaymentWidget (модальное окно)
→ PaymentWidget → POST /api/payment/create → ЮКасса embedded checkout (или dev-succeeded)
→ Успешная оплата → виджет закрывается → runGeneration() запускается напрямую
→ page.tsx читает pendingGeneration из sessionStorage → runGeneration()
→ POST /api/generate → проверяет Payment (status=succeeded, usedAt=null)
→ прокси на FastAPI POST /api/generate/referat → возвращает { jobId }
→ `/api/generate` сразу отвечает `{status:"running", jobId}` (без long-wait)
→ frontend поллит GET /api/generate/poll?workType=X&startedAt=Y&includeResult=1 каждые 5с
→ FastAPI генерирует в фоновом потоке: generator.py (Claude API) → JSON
→ `/api/generate/poll` при `done` забирает result из FastAPI, сохраняет Generation в БД (+slug), отправляет email/TG
→ frontend получает `{status:"done", id, slug, result}` и показывает модал результата
```

**Dev-режим без ЮКассы:** если `YOKASSA_SHOP_ID` пуст, `/api/payment/create` создаёт платёж со статусом `succeeded` автоматически.

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

**Модульный паттерн `_extras`:** polling живёт вне React lifecycle (иначе stale closure при ре-рендерах). Аналогично `_gen` для основной генерации.

## Бэкенд (FastAPI)

### main.py
- In-memory хранилища: `_jobs` (основная генерация), `_extras_jobs` (доп. материалы)
- Слот-based лимит: `WORK_SLOTS` — вес каждого типа (Сочинение/Эссе=1, Доклад/Реферат=2, Курсовая=4, ВКР=5), `MAX_SLOTS=8`
  - `_used_slots()` — суммирует веса запущенных заданий
  - `_available_types()` — типы, которые можно запустить прямо сейчас
  - `GET /api/slots` — публичный эндпоинт: `{used, max, available}`
  - 503 при нехватке слотов возвращает `{message, available}` — список доступных типов
- Задания: `running → done | error`. При получении result задание удаляется (`_job_pop`)
- Extras-задания не удаляются — нужны для повторного скачивания файлов
- Добавлена TTL-очистка файлов extras в `/tmp` (`pptx_*.pptx`, `speech_*.docx`) старше 24 часов

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
- `generate_presentation` — генерирует JSON-структуру слайдов через Claude API, затем вызывает `node pptx_builder.js` через subprocess
- `_WORK_TYPE_PALETTE` — маппинг типа работы → палитра: ВКР/Курсовая→`dark_gold`, Реферат/Доклад→`blue_academic`, Эссе/Сочинение→`burgundy_warm`
- `_build_slides_prompt()` — промпт для AI, генерирует JSON слайдов с полями `image_query`/`image_query2` (английский, для поиска картинок)
- Курсовая/ВКР: до 12 разделов × 600 символов, max_tokens=3500; остальные: 7 × 400, max_tokens=2500
- Типы слайдов: `TITLE`, `RELEVANCE`, `OVERVIEW`, `CONTENT`, `STATS`, `CONCLUSION`, `SOURCES`, `FINAL`
- `generate_speech` — генерирует текст выступления 3-5 мин (450-600 слов) и сохраняет как DOCX

### pptx_builder.js (Node.js, backend/)
- CLI: `node pptx_builder.js <input.json> <output.pptx> [pixabay_key]`
- 3 палитры: `dark_gold`, `blue_academic`, `burgundy_warm`
- Иконки: react-icons/fa → SVG → sharp → PNG base64
- Загрузка изображений: `looksLikeNamedEntity(q)` → Wikipedia первой (точнее для именных/исторических тем), иначе Pixabay → Wikipedia → плейсхолдер
- Скоринг Pixabay: `scoreHit()` — стоп-слова + совпадения ключей в тегах, MIN_SCORE=2; blacklist (love, flower, cute, cartoon, abstract…)
- Зависимости: `backend/package.json` — pptxgenjs, react, react-dom, react-icons, sharp

### github_proxy.py
- Прокси через GitHub Actions для обхода блокировок Claude API из РФ
- Запускается при старте FastAPI (`start_callback_server()`)
- `PROXY_SECRET` обязателен (insecure fallback удалён, при отсутствии backend падает на старте callback-сервера)

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

**`app/page.tsx`** — главная страница
- Hero с формой + выбором типа работы + TypewriterInput
- Прогресс-бар (тёмная тема, navy градиент `#061525 → #1B3A6B`, shimmer) — шаги в `stepsRef` (ref, не state — избегает stale closure)
  - Дизайн: точки-шаги (pending/active с пульсацией/done), тема работы в кавычках, счётчик «Шаг N из M», анимированная смена подписи текущего шага (`key={stepIndex}` для ре-монтирования)
- Результат с DOCX-превью (`docx-preview`) и extras-переключателями
- Лендинг (снизу от hero): «Почему Refai?» (карточки с SVG-иконками), «Как это работает» (3 шага с иконками справа от номера), блок сравнения «Самостоятельно vs Refai» (6 строк), «Последние проекты», «Свежие отзывы», FAQ, PreFooter
- Scroll-reveal анимации: `[data-reveal]` + `[data-visible="true"]` через IntersectionObserver (threshold 0.08); иконки шагов получают `stepIconPop` анимацию при появлении
- Модальное окно результата через `createPortal(document.body)`
- Две колонки на десктопе (превью + панель), bottom-sheet на мобиле

**Модульные переменные (вне React) в page.tsx:**
- `_gen` — состояние основной генерации. Не сбрасывается при client-side навигации, только при F5. Автоочистка через 60с после завершения
- `_extras` — состояние extras-генерации. Паттерн observer: `_extras.listen(cb)`, `_extras.resolve(ready, err)`. Polling вне useEffect (не зависит от lifecycle компонента)
- `_extrasPollingStarted` — флаг, предотвращает дублирование polling при ре-маунтах
- `_extrasGenId` — хранит DB id генерации для сохранения extras job IDs

**`app/dashboard/page.tsx`** — «Мои работы»
- Список карточек с бейджами типа работы
- Extras-бейджи: Презентация (красный `#EF4444`), Выступление (янтарный `#F59E0B`)
- Модальное окно через `createPortal`: DOCX-превью слева + info-панель справа (десктоп), bottom-sheet (мобиль)
- Кнопки скачивания с иконками: DOCX (`/docx-icon.png`), Презентация (`/pptx-icon.svg`), Выступление (`/txt-icon.svg`)
- `renderPreview` использует `docx-preview` (renderAsync, `experimental: true`)
- `applyScale` — устанавливает `--docx-scale` CSS-переменную + `transform: scale()` + компенсирует `marginBottom`; зум через `applyZoom`

**`app/components/TypewriterInput.tsx`** — анимированный placeholder
- Анимация через CSS-оверлей (не pixel-calc), cursor всегда вплотную к тексту

**`app/components/PreFooter.tsx`** — CTA-секция с анимированными карточками документов (якорь `#generator`)

**`app/components/PaymentWidget.tsx`** — модальное окно оплаты (embedded ЮКасса или dev-succeeded). Открывается из главной страницы вместо редиректа на /payment.

**`app/components/AuthModal.tsx`** — модалка авторизации для неавторизованных пользователей

**`app/[workType]/page.tsx`** — SEO-хаб по типу работы (`/referat`, `/kursovaya` и т.д.): список тем с фильтрами, ссылки на отдельные SEO-страницы

**`app/[workType]/[slug]/page.tsx`** — SEO-страница конкретной работы: содержание (TOC), предпросмотр текста с блюром, список литературы (фрагмент), CTA с кнопкой генерации, SEO bodyText, breadcrumbs, JSON-LD (BreadcrumbList + Article)

**`app/profile/page.tsx`** — профиль: поля титульника (университет, факультет, кафедра, специальность, дисциплина, курс, группа, ФИО, преподаватель, город). `GET/PATCH /api/profile`

**`app/preview/[slug]/`** — публичный предпросмотр. Гостям: первые 2 предложения + первые 3 источника. Владельцу: всё.

**`app/admin/`** — админ-панель (роль `admin`): статистика + график, управление пользователями / платежами / работами / отзывами
- `admin/feedback/page.tsx` — таблица отзывов: дата, пользователь, тема, тип, звёзды, проблемы, комментарий; фильтр по проблеме, пагинация
- Дашборд: блоки «Средний рейтинг», «Отзывов за 7 дней», «Топ проблем» с мини-барами

### API-маршруты

| Маршрут | Метод | Описание |
|---------|-------|----------|
| `/api/generate` | POST | Проверяет Payment → запускает backend job → сразу возвращает `{status:"running", jobId}` |
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
| `/api/download` | POST | Скачать DOCX результата |
| `/api/download/presentation/[jobId]` | GET | Прокси PPTX с бэкенда |
| `/api/download/speech/[jobId]` | GET | Прокси speech DOCX с бэкенда |
| `/api/preview/[slug]` | GET | Публичный предпросмотр |
| `/api/preview/[slug]/download` | GET | Скачать DOCX по slug |
| `/api/profile` | GET/PATCH | Профиль пользователя |
| `/api/admin/*` | — | Статистика, пользователи, платежи, работы, отзывы |
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

- **`User`** — NextAuth + профильные поля титульника (university, faculty, department, speciality, discipline, course, groupNumber, fullName, teacherName, city), `role: "user"|"admin"|"yukassa_test"`, `banned: Boolean`, `password: String?` (bcrypt, для тестовых аккаунтов)
- **`Generation`** — `result` (JSON-строка), `isPublic`, `slug` (уникальный), `extras` (JSON: `{"presentation":"jobId","speech":"jobId"}`), `rating Int?` (1–5, из письма)
- **`Payment`** — `usedAt: null` = не использован; `workType` привязан к типу работы
- **`ExtrasJob`** — ownership `extrasJobId -> userId` для защиты `/api/generate/extras/status/*`
- **`HealthCheck`** — лог проверок состояния системы
- **`SeoPage`** — SEO-страницы по типу работы + предмету
- **`FeedbackComment`** — детальный отзыв: `generationId`, `issues` (JSON-массив строк), `comment String?`

**`lib/db.ts`** — хелперы: `saveGeneration`, `getUserGenerations`, `getGeneration`, `deleteGeneration`, `updateGenerationExtras`

## Авторизация (lib/auth.ts)

- Яндекс OAuth + Email magic link (Resend REST API, не SMTP)
- VK OAuth закомментирован (не планируется в ближайшее время)
- Сессии в БД (`strategy: "database"`)
- Callback URL Яндекс (prod): `https://ref-ai.ru/api/auth/callback/yandex`
- **Nginx**: `/api/feedback` (и `/api/feedback/comment`) проксируется на Next.js:3000, а не на FastAPI:8000 — отдельный `location /api/feedback` блок стоит ПЕРЕД общим `location /api/`
- ID пользователя добавляется в сессию через `callbacks.session`
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

**ОС:** Ubuntu 22.04 LTS, 2 vCPU, 2 GB RAM, 30 GB SSD (хостинг Timeweb Cloud)

**Процессы (PM2):**
- `frontend` — Next.js :3000
- `backend` — uvicorn FastAPI :8000
- `tg-bot` — Telegram-бот (Python)
- `vpn` — sing-box (VPN)

**Nginx:** reverse proxy для ref-ai.ru. Правило: специфичные `location /api/foo` → Next.js:3000 (с авторизацией). Фолбэк `location /api/` → FastAPI:8000 (без авторизации, только публичные эндпоинты: `/api/slots`).
- Важный explicit-проксируемый маршрут: `/api/gift` должен идти в Next.js (`3000`), иначе будет 404 от FastAPI-фолбэка.

**Proxy для исходящих запросов:** Privoxy (:8118). Backend и Claude Code используют `HTTPS_PROXY=http://127.0.0.1:8118` / `ALL_PROXY=http://127.0.0.1:8118` (прописаны в `.bashrc`). Запускать `claude` напрямую — без `proxychains4`.
- Для PM2 HTTP-процессов (`frontend`, `backend`) не использовать `LD_PRELOAD=libproxychains.so.4` (ломает OAuth/HTTP callbacks). Допустим только стандартный proxy через `HTTPS_PROXY`/`ALL_PROXY`.

**SSL:** Let's Encrypt, auto-renew certbot.

**БД:** SQLite (`frontend/prisma/dev.db`). Prisma ORM.

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
- ✅ Автогенерация после оплаты (sessionStorage + ?autoGenerate=1)
- ✅ Восстановление прогресса при уходе со страницы (модульная переменная `_gen`)
- ✅ Дополнительные материалы: Презентация (PPTX) + Текст выступления (DOCX)
  - ✅ Генерация PPTX через Node.js pptxgenjs (pptx_builder.js), вызов из Python subprocess
  - ✅ 3 палитры по типу работы (dark_gold / blue_academic / burgundy_warm)
  - ✅ Изображения: Wikipedia (именные сущности) → Pixabay со скорингом → плейсхолдер
  - ✅ Скоринг Pixabay: стоп-слова + совпадения тегов, MIN_SCORE=2, blacklist нерелевантных тегов
  - ✅ Polling вне React lifecycle (модульная переменная `_extras`)
  - ✅ Сохранение job IDs в БД (поле `extras` у Generation)
- ✅ Расширенный титульный лист: поля city, speciality, discipline + чекбоксы «не указывать» для faculty/speciality/discipline
- ✅ Social proof на лендинге: живая лента 50 работ с ротацией, счётчик генераций за день
- ✅ Публичные превью работ по slug (SEO, частичное содержимое для гостей)
- ✅ Скачивание DOCX/PPTX по slug и из результата (иконки DOCX/PPTX/TXT)
- ✅ Лендинг: «Почему Refai?», «Последние проекты», «Свежие отзывы», FAQ, PreFooter
- ✅ Раздел «Последние проекты»: реалистичные mock-данные, цветные карточки по типу, замена реальными данными при ≥ 8 работ в БД
- ✅ Админ-панель: статистика, управление пользователями/платежами/работами
- ✅ SEO-инфраструктура: хаб-страницы по типу работы (`/referat` и т.д.) + детальные страницы (`/referat/[slug]`) с JSON-LD, breadcrumbs, предпросмотром, CTA
- ✅ PaymentWidget: оплата через модальное окно (без редиректа на /payment), embedded ЮКасса checkout
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
