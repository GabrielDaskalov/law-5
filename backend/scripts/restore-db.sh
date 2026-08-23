#!/usr/bin/env bash
# ============================================================
# Law+ — възстановяване на базата от бекъп
#
# Използване: bash scripts/restore-db.sh backups/pravo_academy_2026-08-05_03-00.sql.gz
# ВНИМАНИЕ: Презаписва текущата база!
# ============================================================
set -e

FILE="$1"
[ -f "$FILE" ] || { echo "Използване: bash scripts/restore-db.sh backups/файл.sql.gz"; exit 1; }

DB_NAME=$(grep -E '^DB_NAME=' .env 2>/dev/null | cut -d= -f2); DB_NAME=${DB_NAME:-pravo_academy}
DB_USER=$(grep -E '^DB_USER=' .env 2>/dev/null | cut -d= -f2); DB_USER=${DB_USER:-postgres}

read -p "⚠  Това ще ПРЕЗАПИШЕ базата '$DB_NAME' с $FILE. Сигурен ли си? (yes/no) " ANSWER
[ "$ANSWER" = "yes" ] || { echo "Отказано."; exit 1; }

if docker compose -f docker-compose.prod.yml ps db 2>/dev/null | grep -q running; then
  gunzip -c "$FILE" | docker compose -f docker-compose.prod.yml exec -T db psql -U "$DB_USER" -d "$DB_NAME"
else
  gunzip -c "$FILE" | psql -U "$DB_USER" -d "$DB_NAME"
fi

echo "✅ Базата е възстановена от $FILE"
