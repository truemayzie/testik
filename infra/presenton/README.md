# Presenton (self-host) для Refai

## Быстрый старт

```bash
# Privoxy для Docker: 172.17.0.1:8118 (см. /etc/privoxy/config)
# Опционально socat, если 8118 не слушает на docker bridge:
# socat TCP-LISTEN:18118,bind=172.17.0.1,fork,reuseaddr TCP:127.0.0.1:8118 &

cd /var/www/ref-ai/infra/presenton
cp .env.example .env
# ANTHROPIC_API_KEY, PEXELS_API_KEY, AUTH_PASSWORD

docker compose up -d
# Первый старт ~60 с; проверка:
NO_PROXY=127.0.0.1,localhost curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:5001/
```

## Патчи (docker-compose volumes)

1. `patches/available_models.py` — `trust_env=True` для Privoxy (иначе 403 Anthropic).
2. `patches/generate_presentation_structure.py` — `to_string()` без `with_schema` (баг образа при `slides_markdown`).

Модель в `.env`: `ANTHROPIC_MODEL=claude-haiku-4-5-20251001` (быстрее/дешевле Sonnet).

## Включить в Refai

В `backend/.env`:

```env
PRESENTON_URL=http://127.0.0.1:5001
PRESENTON_AUTH_USER=refai
PRESENTON_AUTH_PASSWORD=<из infra/presenton/.env>
PRESENTATION_PROVIDER=presenton
PRESENTON_CONTENT_MODE=from_result   # текст слайдов из result, не переписывать план
PRESENTON_VERBOSITY=standard
NO_PROXY=127.0.0.1,localhost
```

```bash
pm2 restart backend --update-env
```

**Время (Haiku + from_result):** ~8 слайдов ≈ 4 мин. Старый режим Sonnet + full_text был ~5+ мин на 3 слайда.

**Стоимость:** смотреть в [Anthropic Console](https://console.anthropic.com) по ключу из `infra/presenton/.env` (отдельно от основной генерации работ). Оценка Haiku на 8 слайдов — порядка **нескольких центов**, не долларов.

## Поведение

- Extras «Презентация» → Presenton PPTX; при ошибке — fallback на внутренний `render_slides`.
- **Текст слайдов** берётся из `result` (`build_slides_from_result` → `slides_markdown`). Presenton **не** переписывает план с нуля, но всё ещё вызывает LLM: раскладка + заполнение полей шаблона + картинки Pexels.
- **Чисто «только визуал» без LLM Presenton** в self-host v1 нельзя — для этого остаётся `PRESENTATION_PROVIDER=internal` + `render_slides.js` (темы Presenton, без второго API).
- Превью в модалке — из `build_slides_from_result` (не 1:1 с PPTX Presenton).
- PPTX: `http://127.0.0.1:5001/app_data/exports/...`

Бенчмарк: `cd backend && NO_PROXY=127.0.0.1,localhost python3 scripts/benchmark_presenton.py`

## Cloud API (без Docker)

```env
PRESENTON_API_URL=https://api.presenton.ai
PRESENTON_API_KEY=sk-presenton-...
PRESENTATION_PROVIDER=presenton
```
