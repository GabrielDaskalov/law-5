-- ============================================================
-- Миграция 005: Пакети и покупки за Law+
--
-- Сайтът продава ЕДНОКРАТНИ пакети по дисциплини (lifetime
-- достъп), не абонаменти. Тази миграция добавя:
--   packages  — дисциплините/пакетите (id-тата съвпадат със
--               SUBJECTS в frontend-а: krb, rpp, ibdp, lat...)
--   purchases — кой потребител кой пакет притежава
-- ============================================================

CREATE TABLE IF NOT EXISTS packages (
  id VARCHAR(30) PRIMARY KEY,              -- 'krb', 'rpp'... (същите като в сайта)
  name VARCHAR(200) NOT NULL,
  description TEXT,
  price_eur DECIMAL(10,2) NOT NULL DEFAULT 35.00,
  stripe_price_id VARCHAR(255),            -- попълва се от Stripe Dashboard
  is_bundle BOOLEAN DEFAULT FALSE,         -- true за „Комплексен пакет"
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_id VARCHAR(30) NOT NULL REFERENCES packages(id),
  stripe_session_id VARCHAR(255) UNIQUE,   -- Stripe Checkout Session
  stripe_payment_intent VARCHAR(255),
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'EUR',
  status VARCHAR(30) NOT NULL DEFAULT 'completed', -- pending, completed, refunded
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id, package_id)             -- един пакет се купува веднъж
);

CREATE INDEX IF NOT EXISTS idx_purchases_user ON purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_package ON purchases(package_id);
CREATE INDEX IF NOT EXISTS idx_purchases_session ON purchases(stripe_session_id);

-- Пакетите от сайта (цена 35 € еднократно; комплексният е 165 €)
-- ВСИЧКИ дисциплини от сайта (SUBJECTS) — id-тата съвпадат 1:1
INSERT INTO packages (id, name, price_eur, is_bundle) VALUES
  ('krb',  'Конституционно право на РБ', 35.00, false),
  ('rpp',  'Римско частно право', 35.00, false),
  ('ibdp', 'История на българската държава и право', 35.00, false),
  ('lat',  'Латински език за юристи', 35.00, false),
  ('otp',  'Обща теория на правото', 35.00, false),
  ('gpob', 'Гражданско право — обща част', 35.00, false),
  ('vp',   'Вещно право', 35.00, false),
  ('oblp', 'Облигационно право', 35.00, false),
  ('apr',  'Административно право', 35.00, false),
  ('aprc', 'Административен процес', 35.00, false),
  ('aps',  'Административно право — специална част', 35.00, false),
  ('eul',  'Право на Европейския съюз', 35.00, false),
  ('le',   'Legal English', 35.00, false),
  ('np',   'Наказателно право', 35.00, false),
  ('nk',   'Наказателно право — особена част', 35.00, false),
  ('nip',  'Наказателен процес', 35.00, false),
  ('krim', 'Криминалистика', 35.00, false),
  ('pds',  'Право на държавната служба', 35.00, false),
  ('se',   'Съдебни експертизи', 35.00, false),
  ('fp',   'Финансово право', 35.00, false),
  ('me',   'Международни отношения и право', 35.00, false),
  ('mpp',  'Международно публично право', 35.00, false),
  ('bundle', 'Комплексен пакет (5+ дисциплини)', 165.00, true)
ON CONFLICT (id) DO NOTHING;
