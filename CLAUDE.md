# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Always respond in Russian. Всегда отвечай на русском языке.

## Что это

Сервис генерации учебных работ (рефераты, курсовые, ВКР, эссе, доклады, сочинения) с оформлением по ГОСТ, авторизацией и оплатой через ЮКассу.

**Стек:** Next.js 14 + TypeScript + NextAuth.js + Prisma (SQLite) | FastAPI + python-docx + Groq API (llama-3.3-70b-versatile)

## Команды

```bash
# Backend (порт 8000) — из папки backend/
venv\Scripts\activate
uvicorn main:app --reload          # для разработки (авто-перезапуск при изменении файлов)
uvicorn main:app                   # для тестирования генерации — БЕЗ --reload!

# Frontend (порт 3000) — из папки frontend/
npm run dev
npm run build

# БД — останови dev-сервер перед db:push (блокирует .dll на Windows)
npm run db:push      # применить схему
npm run db:studio    # GUI Prisma Studio
```

## Архитектура: поток генерации

```
Пользователь вводит тему + выбирает тип работы
→ handleSubmit → GET /api/payment/check?workType=X
→ Нет платежа → sessionStorage.pendingGeneration → /payment?workType=X
→ /payment → POST /api/payment/create → ЮКасса (или dev-succeeded)
→ /payment/success → redirect /?autoGenerate=1
→ page.tsx читает pendingGeneration из sessionStorage → runGeneration()
→ POST /api/generate → проверяет Payment (status=succeeded, usedAt=null)
→ прокси на FastAPI /api/generate/referat
→ FastAPI: generator.py (Groq) → JSON → formatter.py (DOCX)
→ usedAt = now() → /api/generations сохраняет в Generation
```

**Dev-режим без ЮКассы:** если `YOKASSA_SHOP_ID` пуст, `/api/payment/create` создаёт платёж со статусом `succeeded` автоматически.

**Восстановление прерванной генерации:** при старте `runGeneration` сохраняет `sessionStorage.activeGeneration`. При ремонте компонента (переход по приложению) — если запись есть и моложе 10 мин, генерация перезапускается автоматически.

## Бэкенд (FastAPI)

- `generator.py` — `WORK_RULES` dict: лимиты страниц, флаги `has_title_page/has_toc/has_sources` для каждого типа работы. CrossRef ищет реальные источники (только если `has_sources=True`). Groq генерирует структуру и каждый раздел отдельно через тип-специфичные prompt-функции: `get_structure_prompt`, `get_intro_prompt`, `get_section_prompt`, `get_conclusion_prompt`.
- `formatter.py` — DOCX по ГОСТ. Условно добавляет: титульный лист (`has_title_page`), оглавление (`has_toc`, заголовок СОДЕРЖАНИЕ/ОГЛАВЛЕНИЕ по типу), список литературы (`has_sources`). Правое поле 1.5см для коротких форматов (Эссе, Доклад, Сочинение), 1.0см для остальных.
- Таблицы передаются как `[TABLE]{json}[/TABLE]` — парсятся во фронте и в DOCX.
- CORS разрешён только для `http://localhost:3000`.
- `generate_referat = generate_work` — алиас для обратной совместимости.

## Фронтенд (Next.js)

**Типы работ** (все активны, отсортированы по возрастанию страниц):
`Сочинение → Эссе → Доклад → Реферат → Курсовая → ВКР`

**Ключевые файлы:**
- `app/page.tsx` — главная страница. Содержит: hero с формой, типы работ, TypewriterInput, прогресс-бар (тёмная тема), результат, + секции лендинга: «Почему Refai?», «Последние проекты», «Свежие отзывы», FAQ, PreFooter.
- `app/components/TypewriterInput.tsx` — анимированный placeholder с мигающим курсором. Анимация через оверлей (не pixel-calc), cursor всегда вплотную к тексту.
- `app/components/PreFooter.tsx` — декоративная секция с анимированными карточками документов и CTA «Попробовать бесплатно» (якорь `#generator`).
- `app/components/AuthModal.tsx` — модальное окно авторизации, появляется если неавторизованный пользователь пытается сгенерировать работу.
- `app/page.module.css` — все стили главной страницы. Прогресс-карточка — тёмный градиент (#0D0B2E → #2D1B6E) с shimmer-анимацией на полосе.
- `app/profile/page.tsx` — профиль пользователя: поля для автозаполнения титульника (университет, факультет, кафедра, специальность, дисциплина, курс, номер группы, ФИО, имя преподавателя, город). API: `GET/PATCH /api/profile`.
- `app/preview/[slug]/page.tsx` + `PreviewClient.tsx` — публичная страница предпросмотра работы (slug из Generation). Гостям видны первые 2 предложения каждого раздела и первые 3 источника. Владелец видит полное содержимое.
- `app/admin/` — панель администратора. Страницы: `/admin` (статистика + график), `/admin/users`, `/admin/payments`, `/admin/works`. Доступно только роли `admin`.
- `lib/auth.ts` — Яндекс OAuth + Email через Resend REST API (не SMTP). VK закомментирован (нужен HTTPS).
- `lib/prices.ts` — единственный источник цен (`WORK_PRICES`) и диапазонов страниц (`WORK_PAGES`) для всех типов.
- `lib/prisma.ts` — singleton Prisma-клиент.
- `app/api/generate/route.ts` — проверяет `Payment` (status=succeeded, usedAt=null), проксирует на FastAPI, затем `usedAt = now()`.
- `app/api/payment/` — `create` / `webhook` / `check`.
- `app/api/generations/route.ts` — POST сохраняет (генерирует slug), GET возвращает историю текущего юзера.
- `app/api/generations/[id]/route.ts` — GET конкретной генерации по id.
- `app/api/generations/recent/route.ts` — публичный GET, возвращает последние 12 работ (только topic, workType, createdAt — без личных данных).
- `app/api/preview/[slug]/route.ts` — публичный GET предпросмотра работы (только `isPublic=true`).
- `app/api/preview/[slug]/download/route.ts` — скачать DOCX работы по slug.
- `app/api/download/route.ts` — скачать DOCX из результата генерации.
- `app/api/profile/route.ts` — GET/PATCH профиля пользователя (поля титульника).
- `app/api/admin/` — stats / users / users/[id] / payments / works / works/[id].

**Прогресс-бар:** функция `getProgressSteps(workType)` возвращает разные наборы шагов:
- Эссе/Сочинение: 4 шага (~60-70с)
- Доклад: 8 шагов (~100-120с)
- ВКР: 11 шагов (~350-420с, включая «Оформляем приложения»)
- Курсовая: 10 шагов (~220-260с)
- Реферат: 10 шагов (~160-180с)

Шаги хранятся в `stepsRef` (ref, не state) чтобы избежать stale closure в `setInterval`.

**Восстановление генерации:** модульная переменная `_gen` (не sessionStorage) — не сбрасывается при client-side навигации, только при F5. Через 60 секунд после завершения сбрасывается автоматически.

**Модели Prisma:**
- `User`, `Account`, `Session` — NextAuth. User дополнен: профильные поля (university, faculty, department, speciality, discipline, course, groupNumber, fullName, teacherName, city), `role: "user"|"admin"`, `banned: Boolean`.
- `Generation` — сохранённые работы (поле `result` — JSON-строка). Добавлены `isPublic: Boolean` (по умолчанию true) и `slug: String?` (уникальный, для публичных превью).
- `Payment` — платёж; `usedAt: null` = не использован; `workType` привязан к конкретному типу работы

**CSS:** CSS Modules рядом с компонентами. Глобальные переменные только в `globals.css` (`--accent: #6366F1`). Глобальные селекторы (`*`, `:root`) нельзя в `.module.css`.

## Авторизация

- Callback URL Яндекс: `http://localhost:3000/api/auth/callback/yandex`
- Сессии хранятся в БД (`strategy: "database"`)
- ID пользователя добавляется в сессию через `callbacks.session`

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

## Статус

- ✅ Генерация всех типов работ (Сочинение, Эссе, Доклад, Реферат, Курсовая, ВКР)
- ✅ Тип-специфичные промпты, структура и оформление (WORK_RULES)
- ✅ DOCX по ГОСТ (условные титульник/оглавление/список литературы)
- ✅ Авторизация (Яндекс + Email magic link)
- ✅ Профиль пользователя (поля для автозаполнения титульника)
- ✅ Личный кабинет + история работ
- ✅ Оплата ЮКасса (включая dev-режим)
- ✅ Автогенерация после оплаты (sessionStorage + ?autoGenerate=1)
- ✅ Восстановление прогресса при уходе со страницы (модульная переменная `_gen`)
- ✅ Публичные превью работ по slug (SEO, частичное содержимое для гостей)
- ✅ Скачивание DOCX по slug и из результата
- ✅ Лендинг: «Почему Refai?», «Последние проекты», «Свежие отзывы», FAQ, PreFooter
- ✅ Админ-панель: статистика, управление пользователями/платежами/работами
- ⏳ VK OAuth (нужен HTTPS домен)
- ⏳ Деплой
