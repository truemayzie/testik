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
- `app/page.tsx` — главная страница. Содержит: hero с формой, типы работ, TypewriterInput, прогресс-бар (тёмная тема), результат, + 4 лендинговые секции: «Почему Academic?», «Последние проекты», «Свежие отзывы», FAQ.
- `app/components/TypewriterInput.tsx` — анимированный placeholder с мигающим курсором. Анимация через оверлей (не pixel-calc), cursor всегда вплотную к тексту.
- `app/page.module.css` — все стили главной страницы. Прогресс-карточка — тёмный градиент (#0D0B2E → #2D1B6E) с shimmer-анимацией на полосе.
- `lib/auth.ts` — Яндекс OAuth + Email через Resend REST API (не SMTP). VK закомментирован (нужен HTTPS).
- `lib/prices.ts` — единственный источник цен (`WORK_PRICES`) и диапазонов страниц (`WORK_PAGES`) для всех типов.
- `lib/prisma.ts` — singleton Prisma-клиент.
- `app/api/generate/route.ts` — проверяет `Payment` (status=succeeded, usedAt=null), проксирует на FastAPI, затем `usedAt = now()`.
- `app/api/payment/` — `create` / `webhook` / `check`.
- `app/api/generations/route.ts` — POST сохраняет, GET возвращает историю текущего юзера.
- `app/api/generations/recent/route.ts` — публичный GET, возвращает последние 12 работ (только topic, workType, createdAt — без личных данных).

**Прогресс-бар:** функция `getProgressSteps(workType)` возвращает разные наборы шагов: 6 шагов для Эссе/Сочинения, 6 для Доклада, 9 для ВКР (с увеличенными таймингами), 9 стандартных для Реферата/Курсовой. Шаги хранятся в `stepsRef` (ref, не state) чтобы избежать stale closure в `setInterval`.

**Модели Prisma:**
- `User`, `Account`, `Session` — NextAuth
- `Generation` — сохранённые работы (поле `result` — JSON-строка)
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
- ✅ Личный кабинет + история работ
- ✅ Оплата ЮКасса (включая dev-режим)
- ✅ Автогенерация после оплаты (sessionStorage + ?autoGenerate=1)
- ✅ Восстановление прогресса при уходе со страницы
- ✅ Лендинг: «Как это работает», «Почему мы?», «Последние проекты», «Отзывы», FAQ
- ⏳ VK OAuth (нужен HTTPS домен)
- ⏳ Деплой
