# Руководство для разработчиков (CONTRIBUTING.md)

Добро пожаловать в проект `ref-ai`! Этот документ предназначен для разработчиков, подключающихся к проекту, и описывает архитектуру, структуру каталогов, стандарты кода и порядок тестирования.

---

## 1. Архитектура проекта

Проект состоит из двух ключевых компонентов:

1. **Frontend (Next.js 14, App Router, TypeScript, React 18, CSS Modules)**
   - Авторизация: NextAuth.js (email magic links через Resend, Яндекс OAuth).
   - База данных: PostgreSQL 17 через Prisma ORM (`frontend/prisma/schema.prisma`).
   - Платежи: ЮKassa (с возможностью dev-режима с авто-одобрением при пустом `YOKASSA_SHOP_ID`).
   - Предпросмотр документов: `docx-preview` на клиенте и `IonPresentationPreview` для слайдов.

2. **Backend (FastAPI, Python 3.13, python-docx, python-pptx)**
   - Генерация текстов: Claude API (`claude-sonnet-4-5` / `claude-3-5-sonnet`) через официальный SDK `anthropic`.
   - Проксирование: прямая поддержка SOCKS5/HTTPS прокси через `socksio` + `httpx[socks]` в обход региональных блокировок.
   - Сборка документов: `python-docx` по стандартам ГОСТ 7.32 / ГОСТ 7.0.11 и `python-pptx` (шаблон Ion).
   - Очередь и лимиты: система слотов нагрузки (`slots.py`) и in-memory кэш задач.

---

## 2. Структура каталогов после рефакторинга

```text
ref-ai/
├── backend/
│   ├── prompts/                 # Изолированные промпты для Claude
│   │   ├── rules.py             # Лимиты страниц, правила структуры (WORK_RULES)
│   │   ├── structure.py         # Промпты генерации оглавления
│   │   └── sections.py          # Промпты для введения, глав и заключения
│   ├── utils/
│   │   └── language.py          # Автоопределение языка (ru/kz/en) и метки
│   ├── templates/               # PPTX шаблоны оформления слайдов
│   ├── tests/                   # Pytest тесты (слоты, промпты, пути, слайды)
│   ├── jobstore.py              # Кроссплатформенная работа с временными файлами
│   ├── generator.py             # Оркестрация вызовов Claude API и расчет токенов
│   ├── formatter.py             # Форматирование DOCX по ГОСТ
│   ├── pptx_template_builder.py # Сборка PPTX презентаций
│   ├── main.py                  # FastAPI роуты и управление слотами
│   └── pytest.ini               # Конфигурация тестов бэкенда
│
├── frontend/
│   ├── app/
│   │   ├── dashboard/           # Личный кабинет пользователя
│   │   │   ├── components/      # Декомпозированные виджеты
│   │   │   │   ├── DashboardWorkCard.tsx # Карточка готовой/активной работы
│   │   │   │   ├── PendingTaskCard.tsx   # Карточка неоплаченного заказа
│   │   │   │   ├── DocViewerModal.tsx    # Модальное окно просмотра DOCX/PPTX
│   │   │   │   ├── TitlePageForm.tsx     # Форма титульного листа
│   │   │   │   ├── ExtrasOrderSection.tsx# Блок заказа презентации/речи
│   │   │   │   └── FeedbackModal.tsx     # Модальное окно отзыва
│   │   │   ├── types.ts         # Типы данных кабинета
│   │   │   └── page.tsx         # Главный контроллер кабинета (~480 строк)
│   │   ├── order/               # Поток оформления и ожидания генерации
│   │   └── api/                 # Next.js API-роуты (генерация, поллинг, оплата)
│   ├── prisma/                  # Prisma схема и миграции (PostgreSQL)
│   └── lib/                     # Общие утилиты и клиентские сессии
```

---

## 3. Локальный запуск

### 3.1. Бэкенд (FastAPI)
1. Активируйте виртуальное окружение:
   ```bash
   cd backend
   # Windows:
   .\venv\Scripts\activate
   # Linux/macOS:
   source venv/bin/activate
   ```
2. Установите зависимости:
   ```bash
   pip install -r requirements-dev.txt
   ```
3. Создайте `.env` в `backend/`:
   ```ini
   ANTHROPIC_API_KEY="sk-ant-..."
   HTTPS_PROXY="socks5://user:pass@host:port"
   ALL_PROXY="socks5://user:pass@host:port"
   ```
4. Запустите тесты:
   ```bash
   pytest
   ```
5. Запустите локальный сервер:
   ```bash
   uvicorn main:app --reload --port 8000
   ```

### 3.2. Фронтенд (Next.js)
1. Перейдите в папку `frontend`:
   ```bash
   cd frontend
   npm install
   ```
2. Настройте подключение к БД в `frontend/.env`:
   ```ini
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ref_ai"
   ```
3. Примените схему БД:
   ```bash
   npx prisma generate
   npx prisma db push
   ```
4. Запустите проверку типов TypeScript:
   ```bash
   npx tsc --noEmit
   ```
5. Запустите dev-сервер:
   ```bash
   npm run dev
   ```

---

## 4. Стандарты разработки и чек-лист перед коммитом

1. **Типизация:** Не допускать ошибок TypeScript (`npx tsc --noEmit` должен завершаться с кодом 0).
2. **Тестирование:** Всегда запускать `pytest` в каталоге `backend/` перед пушем.
3. **Безопасность потоков:** При расчёте расходов или контекста генерации использовать `contextvars.ContextVar`, избегать глобальных разделяемых переменных.
4. **Кроссплатформенность путей:** Никогда не хардкодить `/tmp/` на бэкенде. Использовать `jobstore.get_extras_dir()` и `jobstore.extras_file_path()`.
5. **Оформление ГОСТ:** Не менять табуляцию `TOC_TAB_TWIPS = 8640` и выравнивание списка литературы без сверки с ГОСТ 7.32.
6. **Кэширование API:** Любые роуты со статусами генерации (`poll`, `status`, `extras/status`) обязаны иметь заголовки отключения кэша (`cache: "no-store"`).
