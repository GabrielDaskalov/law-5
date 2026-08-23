-- ============================================================
-- Миграция 008: Изоставена кошница
-- Маркер дали вече сме напомнили за незавършена покупка
-- ============================================================

ALTER TABLE purchases ADD COLUMN IF NOT EXISTS abandoned_email_sent BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_purchases_pending
  ON purchases(status, created_at) WHERE status = 'pending';
