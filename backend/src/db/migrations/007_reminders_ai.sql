-- ============================================================
-- Миграция 007: Имейл напомняния + AI асистент
-- ============================================================

-- Настройка: иска ли потребителят напомняния (по подразбиране да)
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_reminders BOOLEAN NOT NULL DEFAULT TRUE;
-- Кога за последно сме му пращали напомняне (против спам)
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMP;

-- Дневен лимит на AI въпросите (по потребител или IP за нелогнати)
CREATE TABLE IF NOT EXISTS ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identity VARCHAR(120) NOT NULL,          -- 'user:<uuid>' или 'ip:<адрес>'
  day DATE NOT NULL DEFAULT CURRENT_DATE,
  count INTEGER NOT NULL DEFAULT 0,
  UNIQUE (identity, day)
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_identity_day ON ai_usage(identity, day);
