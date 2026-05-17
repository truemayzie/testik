#!/usr/bin/env bash
# Выполнить после того, как DNS staging.ref-ai.ru указывает на этот сервер.
set -euo pipefail
if ! dig +short staging.ref-ai.ru A | grep -q .; then
  echo "DNS staging.ref-ai.ru ещё не резолвится. Добавьте A-запись на IP сервера."
  exit 1
fi
certbot certonly --nginx -d staging.ref-ai.ru --non-interactive --agree-tos --register-unsafely-without-email || \
  certbot certonly --nginx -d staging.ref-ai.ru
echo "Добавьте HTTPS-блок в /etc/nginx/sites-available/staging.ref-ai.ru (или запустите certbot install)."
nginx -t && systemctl reload nginx
