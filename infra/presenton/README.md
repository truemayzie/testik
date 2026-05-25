# Presenton (self-host) для Refai

## Быстрый старт

```bash
# Мост Privoxy (127.0.0.1:8118) → Docker (172.17.0.1:18118)
socat TCP-LISTEN:18118,bind=172.17.0.1,fork,reuseaddr TCP:127.0.0.1:8118 &

cd /var/www/ref-ai/infra/presenton
cp .env.example .env
# Заполните ANTHROPIC_API_KEY, PEXELS_API_KEY, AUTH_PASSWORD

docker compose up -d
# Подождите ~60 с (первый старт)
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5001/
```

## Статус на prod

Self-host Presenton в Docker **пока не стартует**: FastAPI внутри образа не ходит в Anthropic через Privoxy (403 на `/v1/models`). Контейнер остановлен.

**Презентации в проде работают через внутренний пайплайн:**
`PRESENTATION_SLIDES_MODE=deterministic` (по умолчанию) — слайды из `result` без второго Claude.

## Включить Presenton (когда починим прокси в контейнере)

В `backend/.env`:

```env
PRESENTON_URL=http://127.0.0.1:5001
PRESENTON_AUTH_USER=refai
PRESENTON_AUTH_PASSWORD=<из /root/.refai-presenton-auth.txt>
PRESENTATION_PROVIDER=presenton
PRESENTON_THEME=professional-blue
PRESENTON_TEMPLATE=general
```

Privoxy должен слушать `172.17.0.1:8118` (добавлено в `/etc/privoxy/config`).

Перезапуск: `pm2 restart backend --update-env`

## Cloud API (без Docker)

```env
PRESENTON_API_URL=https://api.presenton.ai
PRESENTON_API_KEY=sk-presenton-...
PRESENTATION_PROVIDER=presenton
```

## Поведение

При `PRESENTATION_PROVIDER=presenton` extras «Презентация» идёт в Presenton;
при ошибке — fallback на внутренний Claude + `render_slides`.
Превью слайдов в модалке пока пустое; скачивание PPTX из `/tmp/pptx_{jobId}.pptx`.
