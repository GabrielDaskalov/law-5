#!/usr/bin/env bash
# ============================================================
# Law+ — бекъп на базата данни
#
# Използване:  bash scripts/backup-db.sh
# Автоматично: server-setup.sh го слага в cron (всяка нощ в 3:00)
#
# Пази последните 14 бекъпа в backups/ (компресирани).
# ВЪЗСТАНОВЯВАНЕ: bash scripts/restore-db.sh backups/файл.sql.gz
# ============================================================
set -e

BACKUP_DIR="backups"
KEEP=14
STAMP=$(date +%Y-%m-%d_%H-%M)
FILE="$BACKUP_DIR/pravo_academy_$STAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

# Взима паролата от .env
DB_NAME=$(grep -E '^DB_NAME=' .env 2>/dev/null | cut -d= -f2)
DB_NAME=${DB_NAME:-pravo_academy}
DB_USER=$(grep -E '^DB_USER=' .env 2>/dev/null | cut -d= -f2)
DB_USER=${DB_USER:-postgres}

# През docker контейнера (production) или локално (dev)
if docker compose -f docker-compose.prod.yml ps db 2>/dev/null | grep -q running; then
  docker compose -f docker-compose.prod.yml exec -T db pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$FILE"
else
  pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$FILE"
fi

SIZE=$(du -h "$FILE" | cut -f1)
echo "✅ Бекъп: $FILE ($SIZE)"

# Изтрий старите (пази последните $KEEP)
ls -t "$BACKUP_DIR"/pravo_academy_*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm
echo "   Пазят се последните $KEEP бекъпа."

# ВАЖНО: копирай бекъпите и ИЗВЪН сървъра (rclone/scp към друго място)!
