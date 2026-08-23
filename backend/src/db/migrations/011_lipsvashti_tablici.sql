-- ============================================================================
-- 011 — Липсващите таблици
--
-- Одитът установи, че 28 от 85 GET маршрута връщат 500, защото кодът пише и
-- чете таблици и колони, които никога не са били създадени. Тази миграция
-- ги добавя, така че вече написаният код да проработи.
--
-- Обхваща:
--   audit_logs      — кой администратор какво е направил (изисква се и от ОРЗД)
--   api_keys        — ключове за външен достъп до API-то
--   api_key_logs    — използване на всеки ключ
--   webhooks        — известяване на външни системи
--   webhook_events  — доставки и повторни опити
--   user_preferences — предпочитания за имейл известия
--   notifications   — липсващи колони (title, related_id, scheduled_at, sent_at)
--
-- Всичко е с IF NOT EXISTS — миграцията може да се пусне повторно безопасно.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------- одитна следа
CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  action        VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100),
  resource_id   VARCHAR(255),
  changes       JSONB,
  ip_address    VARCHAR(64),
  user_agent    TEXT,
  status        VARCHAR(20) NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_admin   ON audit_logs (admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_res     ON audit_logs (resource_type, resource_id);

COMMENT ON TABLE audit_logs IS
  'Кой администратор какво е направил. Изисква се по чл. 5(2) и чл. 32 ОРЗД — '
  'при инцидент трябва да може да се докаже какво е било достъпено.';

-- ------------------------------------------------------------- ключове за API
CREATE TABLE IF NOT EXISTS api_keys (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(255) NOT NULL,
  key_hash    VARCHAR(128) UNIQUE NOT NULL,
  created_by  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  rate_limit  INTEGER,
  expires_at  TIMESTAMP,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  last_used   TIMESTAMP,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_owner ON api_keys (created_by);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash  ON api_keys (key_hash) WHERE active;

COMMENT ON COLUMN api_keys.key_hash IS
  'SHA-256 на ключа, не самият ключ. Ключът се показва веднъж при създаване '
  'и повече не може да бъде възстановен.';

CREATE TABLE IF NOT EXISTS api_key_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key_id        UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  endpoint      VARCHAR(255),
  method        VARCHAR(10),
  status        VARCHAR(20),
  response_time INTEGER,
  log_status    VARCHAR(20),
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_key_logs_key ON api_key_logs (key_id, created_at DESC);

-- ------------------------------------------------------------------ webhook-ове
CREATE TABLE IF NOT EXISTS webhooks (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           VARCHAR(255) NOT NULL,
  url            TEXT NOT NULL,
  events         JSONB NOT NULL DEFAULT '[]'::jsonb,
  secret         VARCHAR(255),
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  failure_count  INTEGER NOT NULL DEFAULT 0,
  last_triggered TIMESTAMP,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_admin ON webhooks (admin_id);

CREATE TABLE IF NOT EXISTS webhook_events (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  webhook_id    UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
  event_type    VARCHAR(100) NOT NULL,
  payload       JSONB,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempts      INTEGER NOT NULL DEFAULT 0,
  response_code INTEGER,
  error_message TEXT,
  delivered_at  TIMESTAMP,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_hook   ON webhook_events (webhook_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_failed ON webhook_events (status, created_at) WHERE status = 'failed';

-- ------------------------------------------------- предпочитания за известия
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id                UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_quiz_reminders   BOOLEAN NOT NULL DEFAULT TRUE,
  email_exam_countdowns  BOOLEAN NOT NULL DEFAULT TRUE,
  email_weekly_reports   BOOLEAN NOT NULL DEFAULT TRUE,
  email_achievements     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at             TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ------------------------------------------- липсващи колони в notifications
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title        VARCHAR(255);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS related_id   UUID;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sent_at      TIMESTAMP;

-- Старите редове нямат заглавие; попълваме от типа, за да не са NULL в списъка.
UPDATE notifications SET title = COALESCE(title, initcap(replace(type, '_', ' ')))
 WHERE title IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_pending
  ON notifications (user_id, scheduled_at)
  WHERE sent_at IS NULL;

-- ------------------------------------------------ обезсилване на JWT токени
-- Нужно, за да може „Изход“ и смяната на парола наистина да убиват старите
-- сесии. Без това открадната сесия остава валидна до 24 часа след като
-- потребителят си смени паролата.
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;

-- ----------------------------------------- защита срещу налучкване на пароли
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP;

COMMENT ON COLUMN users.locked_until IS
  'Прогресивно забавяне след поредица неуспешни опити. Нарочно НЕ е твърдо '
  'заключване — то би позволило на всеки, който знае имейла ти, да те държи '
  'заключен вечно.';
