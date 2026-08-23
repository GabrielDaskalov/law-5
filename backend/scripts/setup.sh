#!/usr/bin/env bash
# ============================================================
# Law+ — автоматичен setup скрипт
# Използване: ./scripts/setup.sh
# ============================================================
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }

echo "============================================"
echo "  Law+ — Setup"
echo "============================================"
echo ""

# ---------- 1. Проверка на изискванията ----------
echo "1️⃣  Проверявам изискванията..."

command -v node >/dev/null 2>&1 || fail "Node.js не е инсталиран (нужен е v18+). Изтегли от https://nodejs.org"
NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
[ "$NODE_VERSION" -ge 18 ] || fail "Node.js v18+ е нужен (имаш v$NODE_VERSION)"
ok "Node.js $(node -v)"

command -v npm >/dev/null 2>&1 || fail "npm не е инсталиран"
ok "npm $(npm -v)"

if command -v psql >/dev/null 2>&1; then
  ok "PostgreSQL клиент наличен"
else
  warn "psql не е намерен — ще трябва ръчно да пуснеш миграциите (или ползвай Docker)"
fi

# ---------- 2. Environment файл ----------
echo ""
echo "2️⃣  Настройвам environment..."

if [ ! -f .env ]; then
  cp .env.example .env
  ok "Създаден .env от .env.example"
  warn "ВАЖНО: Отвори .env и попълни STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET и DB_PASSWORD!"
else
  ok ".env вече съществува — не го пипам"
fi

# ---------- 3. Зависимости ----------
echo ""
echo "3️⃣  Инсталирам зависимости..."
npm install
ok "Backend зависимости инсталирани"

if [ -d "../pravo-academy-frontend" ]; then
  (cd ../pravo-academy-frontend && npm install)
  ok "Frontend зависимости инсталирани"
fi

# ---------- 4. База данни ----------
echo ""
echo "4️⃣  База данни..."

if command -v psql >/dev/null 2>&1; then
  # Чете стойностите от .env
  DB_NAME=$(grep -E '^DB_NAME=' .env | cut -d= -f2)
  DB_NAME=${DB_NAME:-pravo_academy}

  read -p "Да създам ли базата '$DB_NAME' и да пусна миграциите? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    createdb "$DB_NAME" 2>/dev/null && ok "База '$DB_NAME' създадена" || warn "Базата вече съществува"
    psql -d "$DB_NAME" -f src/db/schema.sql >/dev/null && ok "Схемата е приложена"
    for MIG in src/db/migrations/0*.sql; do
      psql -d "$DB_NAME" -f "$MIG" >/dev/null && ok "Миграция: $(basename $MIG)"
    done
  fi
else
  warn "Пропускам базата — пусни миграциите ръчно или ползвай: docker compose -f docker-compose.prod.yml up"
fi

# ---------- 5. Проверка ----------
echo ""
echo "5️⃣  Финална проверка..."
npx tsc --noEmit && ok "TypeScript компилира без грешки"

echo ""
echo "============================================"
echo -e "${GREEN}✅ Setup завършен!${NC}"
echo "============================================"
echo ""
echo "Следващи стъпки:"
echo "  1. Попълни Stripe ключовете в .env"
echo "  2. npm run seed        — демо данни (по избор)"
echo "  3. npm run dev         — стартирай backend-а"
echo "  4. cd ../pravo-academy-frontend && npm run dev — стартирай frontend-а"
echo ""
