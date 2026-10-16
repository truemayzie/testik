# Локальный запуск (восстановлено после потери прод-сервера)

Этот файл описывает, что было сделано, чтобы поднять проект локально с нуля
после клонирования из `https://github.com/truemayzie/ref-ai`, и какие
изменения были внесены в код ради локальной разработки.

## Что было сделано

1. **Backend**: создан `backend/venv` (Python 3.13), поставлены зависимости
   из `backend/requirements.txt`.
2. **Backend env**: создан `backend/.env` (пустые значения — см. ниже).
3. **Frontend**: `npm install` в `frontend/`.
4. **Frontend env**: созданы `frontend/.env` (только `DATABASE_URL` — его
   читает Prisma CLI) и `frontend/.env.local` (всё остальное — его читает
   Next.js). Оба файла в `.gitignore`, не пушатся.
5. **БД**: Схема переведена на **PostgreSQL** (`postgresql://postgres:postgres@localhost:5432/ref_ai`).
   - Все данные пользователей, платежей и генераций перенесены.
   - `npx prisma generate` + `npx prisma db push` синхронизируют локальную БД.
6. Проверено: backend (`uvicorn main:app`) поднимается и отвечает на
   `GET /api/slots`; frontend (`npm run dev`) отдаёт `200` на `/`,
   `/auth/signin`, `/dashboard`, `401` на `/api/tasks` без сессии.
7. **Живая генерация проверена end-to-end** (реферат 22 стр.): вход по
   magic link → `POST /api/tasks` → dev-оплата → `POST /api/generate` →
   poll → результат сохранён в БД (`Generation.status=completed`, slug
   сгенерирован). Стоимость ~$0.25 за реферат (claude-sonnet-4-5).

## Грабли локального запуска на Windows (проверено на практике)

- **`ANTHROPIC_BASE_URL` в переменных окружения Windows**: если она задана
  на уровне User/Machine, она перекрывает дефолт `api.anthropic.com` в
  `generator.py` (python-dotenv не перезаписывает уже существующие env).
  На этой машине была остаточная `ANTHROPIC_BASE_URL=https://api.claudehub.fun`
  (чужой прокси) — из-за неё все запросы уходили на чужой сервер и падали
  с 401. Лечение: `[Environment]::SetEnvironmentVariable('ANTHROPIC_BASE_URL', $null, 'User')`
  и снять её в текущем процессе.
- **Из РФ `api.anthropic.com` напрямую заблокирован** (403 `Request not
  allowed`). Локально настроен SOCKS5/HTTPS прокси в `backend/.env`:
  `HTTPS_PROXY=socks5://...` и `ALL_PROXY=socks5://...`.
  Для поддержки SOCKS5 в виртуальное окружение бэкенда установлен пакет `socksio>=1.0.0` (необходим для `httpx[socks]` в SDK Anthropic).
- **Windows-консоль и `✓` в print** (`generator.py:859`): при stdout в
  файл/консоль cp1251 юникод-галочка роняет поток генерации с
  `UnicodeEncodeError`. Запускать бэкенд с `PYTHONIOENCODING=utf-8`.
- **Временные файлы**: временные файлы презентаций и текстов речей хранятся кроссплатформенно в `backend/data/tmp/` (управляется `backend/jobstore.py`).
- **`generate` → status**: у `GET /api/generate/result/{job}` пустая работа —
  он возвращает 400, пока job `running`; статус смотреть через
  `GET /api/generate/status/{job_id}`. Готовый job «дожимает» фоновый
  reconciler Next.js (сохраняет `Generation` в БД и удаляет job).

## Изменения в коде (важно!)

Прод-архитектура была построена вокруг обхода блокировки Claude API из РФ
через **GitHub Actions прокси** (`backend/github_proxy.py`): каждый запрос к
Claude уходил в GitHub Actions, а тот стучался обратно на
`https://ref-ai.ru/proxy-callback`. Так как прод-сервер (Timeweb) утрачен,
а домен/callback сейчас недоступен, этот путь **не может работать локально
без сервера**. Более того, раньше `main.py` **крашился при старте**, если
`PROXY_SECRET` не задан (`raise RuntimeError`).

Внесены два точечных изменения, не трогающие прод-поведение:

- **`backend/github_proxy.py`** — `start_callback_server()` теперь просто
  пропускает запуск callback-сервера (с логом), если `GITHUB_TOKEN`/
  `GITHUB_REPO` не заданы, вместо падения. Если они заданы, но нет
  `PROXY_SECRET` — поведение как раньше (ошибка, это реальная
  неправильная конфигурация).
- **`backend/generator.py`** — функция `ask()` теперь сама выбирает канал:
  - если заданы `GITHUB_TOKEN` + `GITHUB_REPO` + `PROXY_SECRET` → всё как в
    проде, через GitHub Actions прокси;
  - иначе → **прямой вызов Anthropic API** через уже существующий (ранее
    неиспользуемый) `client = anthropic.Anthropic(...)`.

  Это значит: **для локальной генерации достаточно `ANTHROPIC_API_KEY`** в
  `backend/.env`, при условии что с вашего компьютера `api.anthropic.com`
  доступен напрямую (без блокировки/VPN). Если так же заблокирован —
  нужен VPN/прокси на уровне ОС, либо восстанавливать GitHub Actions прокси
  (тогда понадобится публичный callback-URL вместо мёртвого `ref-ai.ru`).

- **`frontend/lib/auth.ts`** — вход по email (magic link) через Resend
  требовал реального `RESEND_API_KEY`. Теперь если ключ не задан,
  ссылка для входа просто печатается в консоль процесса `next dev`
  (`[auth][dev] Magic link для ...`), письмо не отправляется. В проде
  (когда `RESEND_API_KEY` задан) поведение не меняется.

## Что нужно донастроить руками (реальные учётки/ключи)

Без этого проект **запускается и открывается**, но соответствующие функции
работают в «заглушечном» dev-режиме:

| Функция | Без ключей (сейчас) | С реальными ключами |
|---|---|---|
| Генерация работ (Claude) | работает (ключ в `backend/.env` + прокси, см. выше) | добавьте ключ в `backend/.env` |
| Вход по email | ссылка входа в консоли backend/frontend | добавьте `RESEND_API_KEY` в `frontend/.env.local` |
| Вход через Яндекс | кнопка не будет работать (нет client id/secret) | создайте OAuth-приложение на Яндексе с redirect `http://localhost:3000/api/auth/callback/yandex`, впишите `YANDEX_CLIENT_ID`/`YANDEX_CLIENT_SECRET` |
| Оплата | автоматически `succeeded` (dev-режим, см. `/api/payment/create`) | впишите `YOKASSA_SHOP_ID`/`YOKASSA_SECRET_KEY` |
| Презентации/картинки в них | сборка PPTX работает, но поиск картинок — нет | добавьте `PIXABAY_API_KEY` |
| Telegram-уведомления админу | тихо отключены (нет токена) | `TELEGRAM_BOT_TOKEN`/`TELEGRAM_ADMIN_CHAT_ID` в `frontend/.env.local` |

## Как запускать

```bash
# Backend (Windows, из РФ — с прокси и utf-8; иначе генерация упадёт)
cd backend
$env:HTTPS_PROXY = "http://127.0.0.1:7897"
$env:ALL_PROXY   = "http://127.0.0.1:7897"
$env:PYTHONIOENCODING = "utf-8"
venv\Scripts\python -m uvicorn main:app          # http://127.0.0.1:8000

# Frontend (другой терминал)
cd frontend
npm run dev                                         # http://localhost:3000
```

## Тестовый вход без внешних сервисов

1. Открыть `http://localhost:3000/auth/signin`.
2. Ввести любой email → «Получить ссылку для входа».
3. Ссылка появится в консоли, где запущен `npm run dev` (строка
   `[auth][dev] Magic link для ...`). Открыть её в браузере — вход выполнен.

## Известные ограничения текущего состояния

- `/referat`, `/kursovaya` и другие SEO-хабы отдают 404 — таблица
  `SeoPage` пуста (нет прод-данных). Наполняется через
  `npm run seed-seo` / `npm run fill-seo` (требует `ANTHROPIC_API_KEY`).
- Раздел «Последние проекты» на главной работает на моках (в БД < 8
  записей) — это штатное поведение, описанное в `CLAUDE.md`.
