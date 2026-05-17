#!/usr/bin/env bash
# Деплой только staging-фронта (порт 3001). Backend и prod frontend (:3000) не перезапускаются.
set -euo pipefail
cd /var/www/ref-ai/frontend
export NEXT_BUILD_DIR=.next-staging
export NEXT_PUBLIC_IS_STAGING=1
echo "==> build staging (.next-staging)..."
npm run build:staging
if pm2 describe frontend-staging &>/dev/null; then
  pm2 restart frontend-staging --update-env
else
  pm2 start /var/www/ref-ai/ecosystem.config.cjs --only frontend-staging
fi
pm2 save
echo "==> staging OK (http://127.0.0.1:3001). После DNS: https://staging.ref-ai.ru"
