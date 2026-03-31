# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Always respond in Russian. Всегда отвечай на русском языке.

## Что это

Сервис генерации учебных работ (рефераты, курсовые, ВКР, эссе, доклады, сочинения) с оформлением по ГОСТ, авторизацией, оплатой через ЮКассу и дополнительными материалами (презентация + текст выступления).

**Стек:** Next.js 14 + TypeScript + NextAuth.js + Prisma (SQLite) | FastAPI + python-docx + python-pptx + Groq API (llama-3.3-70b-versatile)

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
→ Нет платежа → sessionStorage.pendingGeneration → /payment?workType=X
→ /payment → POST /api/payment/create → ЮКасса (или dev-succeeded)
→ /payment/success → redirect /?autoGenerate=1
→ page.tsx читает pendingGeneration из sessionStorage → runGeneration()
→ POST /api/generate → проверяет Payment (status=succeeded, usedAt=null)
→ прокси на FastAPI POST /api/generate/referat → возвращает { jobId }
→ frontend поллит GET /api/generate/poll?jobId=X каждые 5с
→ FastAPI генерирует в фоновом потоке: generator.py (Groq) → JSON
→ /api/generate/poll получает result → formatter.py (DOCX в памяти)
→ usedAt = now() → /api/generations сохраняет в Generation (+ slug)
→ API возвращает { ...result, _generationId: savedId }
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
- `MAX_CONCURRENT_JOBS = 8` — лимит одновременных заданий
- Задания: `running → done | error`. При получении result задание удаляется (`_job_pop`)
- Extras-задания не удаляются — нужны для повторного скачивания файлов

### generator.py
- `WORK_RULES` dict: лимиты страниц, флаги `has_title_page / has_toc / has_sources` для каждого типа
- CrossRef ищет реальные источники (только если `has_sources=True`)
- Groq генерирует структуру и каждый раздел отдельно через тип-специфичные prompt-функции: `get_structure_prompt`, `get_intro_prompt`, `get_section_prompt`, `get_conclusion_prompt`
- `generate_referat = generate_work` — алиас для обратной совместимости

### formatter.py
- DOCX по ГОСТ. Условно добавляет: титульный лист (`has_title_page`), оглавление (`has_toc`)
- Заголовок оглавления: СОДЕРЖАНИЕ или ОГЛАВЛЕНИЕ в зависимости от типа работы
- Список литературы (`has_sources`)
- Правое поле 1.5 см для коротких форматов (Эссе, Доклад, Сочинение), 1.0 см для остальных
- Таблицы передаются как `[TABLE]{json}[/TABLE]` — парсятся во фронте и в DOCX

### presentation_generator.py
- `_detect_color_scheme(topic)` — выбирает цветовую схему по ключевым словам темы (7 схем)
- `_fetch_image(topic)` — скачивает фото по теме: Unsplash Source → Wikipedia API (ru/en) → None
  - Временный файл в `/tmp/`, удаляется после `prs.save()`
- Типы слайдов: `title`, `bullets`, `stats`, `columns`, `timeline`, `conclusion`, `sources`, `final`
- `_slide_title(img_path=None)` — с фото: полноэкранное изображение + тёмный оверлей; без фото: solid-цвет + декоративные круги
- `_slide_image_bullets(img_path=None)` — буллеты слева 58% + изображение справа 36% (первый bullets-слайд)
- `generate_presentation` — скачивает изображение один раз, передаёт в title-слайд и первый bullets-слайд
- `generate_speech` — генерирует текст выступления 3-5 мин (450-600 слов) и сохраняет как DOCX

### github_proxy.py
- Прокси через GitHub Actions для обхода блокировок Groq из РФ
- Запускается при старте FastAPI (`start_callback_server()`)

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

Extras: Презентация +199 ₽, Текст выступления +219 ₽

### Ключевые файлы фронтенда

**`app/page.tsx`** — главная страница
- Hero с формой + выбором типа работы + TypewriterInput
- Прогресс-бар (тёмная тема, shimmer) — шаги в `stepsRef` (ref, не state — избегает stale closure)
- Результат с DOCX-превью (`docx-preview`) и extras-переключателями
- Лендинг: «Почему Refai?», «Последние проекты», «Свежие отзывы», FAQ, PreFooter
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
- `renderPreview` использует `docx-preview` (renderAsync)
- `applyZoom` / `applyScale` — зум для мобильного превью

**`app/components/TypewriterInput.tsx`** — анимированный placeholder
- Анимация через CSS-оверлей (не pixel-calc), cursor всегда вплотную к тексту

**`app/components/PreFooter.tsx`** — CTA-секция с анимированными карточками документов (якорь `#generator`)

**`app/components/AuthModal.tsx`** — модалка авторизации для неавторизованных пользователей

**`app/profile/page.tsx`** — профиль: поля титульника (университет, факультет, кафедра, специальность, дисциплина, курс, группа, ФИО, преподаватель, город). `GET/PATCH /api/profile`

**`app/preview/[slug]/`** — публичный предпросмотр. Гостям: первые 2 предложения + первые 3 источника. Владельцу: всё.

**`app/admin/`** — админ-панель (роль `admin`): статистика + график, управление пользователями / платежами / работами

### API-маршруты

| Маршрут | Метод | Описание |
|---------|-------|----------|
| `/api/generate` | POST | Проверяет Payment → прокси на FastAPI → сохраняет Generation |
| `/api/generate/poll` | GET | Поллинг статуса основной генерации |
| `/api/generate/extras` | POST | Запускает extras-генерацию через FastAPI |
| `/api/generate/extras/status/[id]` | GET | Статус extras (force-dynamic!) |
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
| `/api/admin/*` | — | Статистика, пользователи, платежи, работы |

### Прогресс-бар генерации (`getProgressSteps`)
- Сочинение/Эссе: 4 шага (~60–70 с)
- Доклад: 8 шагов (~100–120 с)
- Реферат: 10 шагов (~160–180 с)
- Курсовая: 10 шагов (~220–260 с)
- ВКР: 11 шагов (~350–420 с, включая «Оформляем приложения»)

### Секция «Последние проекты»
- `MOCK_RECENT` — 8 реалистичных работ (ВКР, Курсовая ×2, Реферат ×2, Эссе, Доклад, Сочинение)
- API `/api/generations/recent` заменяет mock **только если** вернул ≥ 8 реальных записей (иначе тестовые данные из БД не перекрывают красивые заготовки)
- Карточки: цветная левая полоска + emoji-иконка + цвет бейджа — по типу работы (`WORK_TYPE_COLORS`, `WORK_TYPE_ICONS`)

### Иконки скачивания (`/public/`)
- `/docx-icon.png` — иконка Word для кнопок скачивания DOCX
- `/pptx-icon.svg` — иконка PowerPoint 2019 для кнопок презентации
- `/txt-icon.svg` — иконка TXT для кнопок текста выступления

### CSS-соглашения
- CSS Modules рядом с компонентами. Глобальные переменные только в `globals.css` (`--accent: #6366F1`)
- Глобальные селекторы (`*`, `:root`) нельзя в `.module.css`
- Прогресс-карточка генерации — тёмный градиент (`#0D0B2E → #2D1B6E`) с shimmer-анимацией

## Модели Prisma (SQLite)

- **`User`** — NextAuth + профильные поля титульника (university, faculty, department, speciality, discipline, course, groupNumber, fullName, teacherName, city), `role: "user"|"admin"|"yukassa_test"`, `banned: Boolean`, `password: String?` (bcrypt, для тестовых аккаунтов)
- **`Generation`** — `result` (JSON-строка), `isPublic`, `slug` (уникальный), `extras` (JSON: `{"presentation":"jobId","speech":"jobId"}`)
- **`Payment`** — `usedAt: null` = не использован; `workType` привязан к типу работы
- **`HealthCheck`** — лог проверок состояния системы
- **`SeoPage`** — SEO-страницы по типу работы + предмету

**`lib/db.ts`** — хелперы: `saveGeneration`, `getUserGenerations`, `getGeneration`, `deleteGeneration`, `updateGenerationExtras`

## Авторизация (lib/auth.ts)

- Яндекс OAuth + Email magic link (Resend REST API, не SMTP)
- VK OAuth закомментирован (нужен HTTPS для callback URL)
- Сессии в БД (`strategy: "database"`)
- Callback URL Яндекс: `http://localhost:3000/api/auth/callback/yandex`
- ID пользователя добавляется в сессию через `callbacks.session`
- Тестовый аккаунт ЮКасса: роль `yukassa_test`, bcrypt-пароль, особые условия оплаты

## ENV

**backend/.env:**
```
GROQ_API_KEY=
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

## Статус реализации

- ✅ Генерация всех типов работ (Сочинение, Эссе, Доклад, Реферат, Курсовая, ВКР)
- ✅ Тип-специфичные промпты, структура и оформление (WORK_RULES)
- ✅ DOCX по ГОСТ (условные титульник/оглавление/список литературы)
- ✅ Async-генерация (jobId + polling), лимит 8 параллельных заданий
- ✅ Авторизация (Яндекс + Email magic link)
- ✅ Профиль пользователя (поля для автозаполнения титульника)
- ✅ Личный кабинет + история работ с DOCX-превью (docx-preview)
- ✅ Оплата ЮКасса (включая dev-режим)
- ✅ Автогенерация после оплаты (sessionStorage + ?autoGenerate=1)
- ✅ Восстановление прогресса при уходе со страницы (модульная переменная `_gen`)
- ✅ Дополнительные материалы: Презентация (PPTX) + Текст выступления (DOCX)
  - ✅ Изображения в презентации (Unsplash → Wikipedia → без фото)
  - ✅ Тип-специфичные цветовые схемы (7 вариантов)
  - ✅ Polling вне React lifecycle (модульная переменная `_extras`)
  - ✅ Сохранение job IDs в БД (поле `extras` у Generation)
- ✅ Публичные превью работ по slug (SEO, частичное содержимое для гостей)
- ✅ Скачивание DOCX/PPTX по slug и из результата (иконки DOCX/PPTX/TXT)
- ✅ Лендинг: «Почему Refai?», «Последние проекты», «Свежие отзывы», FAQ, PreFooter
- ✅ Раздел «Последние проекты»: реалистичные mock-данные, цветные карточки по типу, замена реальными данными при ≥ 8 работ в БД
- ✅ Админ-панель: статистика, управление пользователями/платежами/работами
- ⏳ VK OAuth (нужен HTTPS домен)
- ⏳ Деплой
