#!/usr/bin/env bash
# ============================================================
# Law+ — издаване на HTTPS сертификат (Let's Encrypt)
#
# Използване: bash scripts/init-letsencrypt.sh домейн.bg имейл@пример.bg
# Изисква: DNS-ът на домейна вече да сочи към този сървър,
#          stack-ът да е стартиран (портове 80/443 отворени).
# ============================================================
set -e

DOMAIN="$1"
EMAIL="$2"

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  echo "Използване: bash scripts/init-letsencrypt.sh домейн.bg имейл@пример.bg"
  exit 1
fi

echo "1️⃣  Проверка: домейнът сочи ли към този сървър?"
SERVER_IP=$(curl -s ifconfig.me || echo '?')
DOMAIN_IP=$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || echo '?')
echo "   Сървър: $SERVER_IP | $DOMAIN → $DOMAIN_IP"
if [ "$SERVER_IP" != "$DOMAIN_IP" ]; then
  echo "⚠  IP-тата не съвпадат — DNS-ът може още да се разпространява. Продължавам все пак..."
fi

echo "2️⃣  Издаване на сертификат..."
docker compose -f docker-compose.prod.yml run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
  -d $DOMAIN \
  --email $EMAIL --agree-tos --no-eff-email" certbot

echo "3️⃣  Активиране на HTTPS конфигурацията..."
# Замени домейна в SSL конфига и го активирай
sed "s/ДОМЕЙН/$DOMAIN/g" nginx/nginx-ssl.conf > nginx/nginx-active.conf
# Пренасочи compose-а към активния конфиг
sed -i "s|./nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro|./nginx/nginx-active.conf:/etc/nginx/conf.d/default.conf:ro|" docker-compose.prod.yml
docker compose -f docker-compose.prod.yml up -d --force-recreate web

echo ""
echo "✅ Готово! Сайтът е на https://$DOMAIN"
echo "   Сертификатът се подновява автоматично (certbot контейнерът проверява на 12 часа)."
echo "   Не забравяй: FRONTEND_URL и CORS_ORIGIN в .env да са https://$DOMAIN, после:"
echo "   docker compose -f docker-compose.prod.yml up -d api"
