-- Клиентски грешки от браузъра (за наблюдение на живо)
CREATE TABLE IF NOT EXISTS client_errors (
  id SERIAL PRIMARY KEY,
  message VARCHAR(500) NOT NULL,
  source VARCHAR(300),
  stack VARCHAR(2000),
  url VARCHAR(300),
  user_agent VARCHAR(300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_client_errors_created ON client_errors(created_at DESC);
