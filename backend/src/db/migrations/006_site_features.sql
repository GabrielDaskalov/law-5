-- ============================================================
-- Миграция 006: Функционалности от сайта Law+
--   support_tickets + ticket_replies — поддръжка
--   user_states  — синхронизация на прогреса между устройства
--   site_content — централно учебно съдържание (PA_DATA)
-- ============================================================

-- ---------- Support тикети ----------
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',  -- open, answered, closed
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticket_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id UUID REFERENCES users(id) ON DELETE SET NULL,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  body TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tickets_user ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_ticket_replies_ticket ON ticket_replies(ticket_id);

-- ---------- Синхронизация на прогреса ----------
-- Сайтът пази прогреса като JSON (state). Тук той се съхранява по
-- потребител, за да е достъпен от всяко устройство.
CREATE TABLE IF NOT EXISTS user_states (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  device_label VARCHAR(100),               -- от кое устройство е последният запис
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ---------- Централно учебно съдържание ----------
-- Едно съдържание за целия сайт (PA_DATA): конспекти, флашкарти,
-- тестове, казуси. Админ панелът го качва тук вместо да генерира файл.
CREATE TABLE IF NOT EXISTS site_content (
  id VARCHAR(30) PRIMARY KEY DEFAULT 'main',
  data JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);
