#!/usr/bin/env bash
# Деплой prod-фронта. Backend не трогаем — активные генерации на :8000 не сбрасываются.
set -euo pipefail
cd /var/www/ref-ai/frontend
echo "==> clean + build prod (.next)..."
rm -rf .next
npm run build
pm2 restart frontend --update-env
pm2 save
echo "==> prod frontend OK"
