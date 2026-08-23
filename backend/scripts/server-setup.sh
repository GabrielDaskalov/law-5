#!/usr/bin/env bash
# ============================================================
# Law+ — настройка на ЧИСТ Ubuntu сървър (VPS)
#
# Използване (на сървъра, като root или с sudo):
#   bash scripts/server-setup.sh
#
# Прави: Docker + firewall + .env съветник + стартира всичко.
# Тествано за Ubuntu 22.04/24.04.
# ============================================================
set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }

echo "============================================"
echo "  Law+ — Настройка на сървър"
echo "============================================"

[ -f docker-compose.prod.yml ] || fail "Пусни скрипта от папката backend/ (bash scripts/server-setup.sh)"

# ---------- 1. Docker ----------
echo ""
echo "1️⃣  Docker..."
if command -v docker >/dev/null 2>&1; then
  ok "Docker вече е инсталиран"
else
  curl -fsSL https://get.docker.com | sh
  ok "Docker инсталиран"
fi
docker compose version >/dev/null 2>&1 || fail "docker compose plugin липсва — инсталирай docker-compose-plugin"

# ---------- 2. Firewall ----------
echo ""
echo "2️⃣  Firewall (ufw)..."
if command -v ufw >/dev/null 2>&1; then
  ufw allow 22/tcp >/dev/null 2>&1 || true
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  ufw --force enable >/dev/null 2>&1 || true
  ok "Отворени: 22 (SSH), 80 (HTTP), 443 (HTTPS). Всичко друго — затворено."
else
  warn "ufw липсва — провери firewall-а ръчно (трябват само 22, 80, 443)"
fi

# ---------- 3. .env съветник ----------
echo ""
echo "3️⃣  Конфигурация (.env)..."
if [ -f .env ]; then
  ok ".env вече съществува — не го пипам"
else
  cp .env.example .env

  # Генерирай силни секрети автоматично
  JWT=$(openssl rand -hex 32)
  DBPASS=$(openssl rand -hex 16)
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$JWT|" .env
  sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=$DBPASS|" .env
  ok "JWT_SECRET и DB_PASSWORD са генерирани автоматично (силни, случайни)"

  echo ""
  read -p "   Домейн на сайта (напр. pravo-academy.bg, Enter = по-късно): " DOMAIN
  if [ -n "$DOMAIN" ]; then
    sed -i "s|^FRONTEND_URL=.*|FRONTEND_URL=https://$DOMAIN|" .env
    grep -q '^CORS_ORIGIN=' .env && sed -i "s|^CORS_ORIGIN=.*|CORS_ORIGIN=https://$DOMAIN|" .env || echo "CORS_ORIGIN=https://$DOMAIN" >> .env
    ok "Домейнът е записан"
  fi

  # `read -s` = въведеното НЕ се показва на екрана. Иначе live ключът
  # остава в историята на терминала, в scrollback-а и по всеки запис на
  # сесията. `echo` след това връща новия ред, който -s изяжда.
  read -s -p "   Stripe SECRET key (sk_..., Enter = по-късно): " SK; echo
  [ -n "$SK" ] && sed -i "s|^STRIPE_SECRET_KEY=.*|STRIPE_SECRET_KEY=$SK|" .env && ok "Stripe ключът е записан"

  read -s -p "   Stripe WEBHOOK secret (whsec_..., Enter = по-късно): " WH; echo
  [ -n "$WH" ] && sed -i "s|^STRIPE_WEBHOOK_SECRET=.*|STRIPE_WEBHOOK_SECRET=$WH|" .env && ok "Webhook секретът е записан"

  read -s -p "   Anthropic API key за AI (Enter = демо режим): " AK; echo
  if [ -n "$AK" ]; then
    sed -i "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$AK|" .env
  else
    sed -i "s|^AI_STUB=.*|AI_STUB=1|" .env
    warn "AI в демо режим (AI_STUB=1) — добави ключ в .env когато си готов"
  fi

  warn "ПРОВЕРИ .env: SMTP_USER/SMTP_PASSWORD за имейлите (nano .env)"
fi

# ---------- 4. Сайтът: сглобяване (build) ----------
# nginx сервира site/dist, а НЕ site/ — иначе сорсът (tests/03-admin.mjs с
# админска парола, package.json, vite.config.js, src/**) става публичен.
echo ""
echo "4️⃣  Сайтът..."
[ -f ../site/package.json ] || fail "Липсва ../site/package.json — качи цялата папка pravo-academy на сървъра (backend/ + site/)"

if [ -f ../site/dist/index.html ]; then
  ok "site/dist вече е сглобен (за нов билд: rm -rf ../site/dist и пусни пак)"
else
  echo "   Сглобяване (npm ci && npm run build) в Docker — не иска Node на сървъра..."
  docker run --rm -v "$(cd ../site && pwd)":/app -w /app node:20-alpine \
    sh -c "npm ci && npm run build" || fail "Билдът на сайта падна — виж грешката отгоре"
  [ -f ../site/dist/index.html ] || fail "Билдът мина, но липсва site/dist/index.html"
  ok "site/dist е готов"
fi

# ---------- 5. Старт ----------
echo ""
echo "5️⃣  Стартиране на stack-а..."
docker compose -f docker-compose.prod.yml up -d --build
echo "   Изчакване на health checks..."
sleep 25
# Порт 80 вече само пренасочва към HTTPS (301), затова питаме API-то отвътре.
if docker compose -f docker-compose.prod.yml exec -T api wget -qO- http://localhost:3000/health >/dev/null 2>&1; then
  ok "Всичко работи!"
else
  warn "Health check още не минава — виж: docker compose -f docker-compose.prod.yml logs api"
fi

# ---------- 6. Бекъп cron ----------
echo ""
echo "6️⃣  Автоматични бекъпи..."
CRON_LINE="0 3 * * * cd $(pwd) && bash scripts/backup-db.sh >> /var/log/pravo-backup.log 2>&1"
( crontab -l 2>/dev/null | grep -v backup-db.sh ; echo "$CRON_LINE" ) | crontab -
ok "Бекъп всяка нощ в 3:00 (пази последните 14; виж scripts/backup-db.sh)"

echo ""
echo "============================================"
echo -e "${GREEN}✅ Сървърът е готов!${NC}"
echo "============================================"
echo ""
echo "Следващи стъпки:"
echo "  1. Насочи DNS на домейна към този сървър (A запис)"
echo "  2. HTTPS: bash scripts/init-letsencrypt.sh твоя-домейн.bg твоя@имейл.bg"
echo "  3. Stripe Dashboard → Webhooks → https://домейн/webhooks/stripe"
echo "     (събития: checkout.session.completed, charge.refunded)"
echo "  4. Отвори https://домейн и направи тестова покупка с карта 4242..."
echo ""
