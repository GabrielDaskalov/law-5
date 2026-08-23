-- ============================================================================
-- 013 — Регистър на устройствата и следа от подозрителното
--
-- Миграция 012 спря ЕДНОВРЕМЕННОТО ползване на един акаунт. Тя обаче не спира
-- редуването: четирима души спокойно се редуват на един профил и никой от тях
-- не е онлайн едновременно с друг.
--
-- Тук се добавят двете неща, които го хващат:
--
--   user_devices     — кои устройства изобщо е виждал акаунтът. Над определен
--                      брой различни за 30 дни новото устройство се потвърждава
--                      по имейл. Не заключване: човекът със сменен телефон
--                      минава с едно кликване, курсът от петима — не.
--
--   security_signals — какво необичайно е забелязано и колко тежи. Числата се
--                      събират, за да има какво да гледа човек — не за да
--                      наказва програмата сама.
--
-- Всичко е с IF NOT EXISTS — миграцията може да се пусне повторно безопасно.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- --------------------------------------------------------- регистър устройства
CREATE TABLE IF NOT EXISTS user_devices (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Същият номер, който браузърът връща при вход (виж 012). Идва от клиента,
  -- тоест може да се подправи. Подправянето обаче не отваря врата: две
  -- устройства с един и същ номер се броят за едно и се изхвърлят взаимно,
  -- а нов измислен номер е ново устройство и удря в лимита.
  device_id          VARCHAR(64) NOT NULL,
  label              VARCHAR(120),

  first_seen_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  last_seen_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  last_ip            VARCHAR(64),

  -- NULL = устройството чака потвърждение по имейл.
  confirmed_at       TIMESTAMP,
  -- Пази се ХЕШЪТ на кода за потвърждение, не самият код: изтекла база не
  -- бива да дава на никого готови ключове за чужди устройства.
  confirm_token      VARCHAR(64),
  confirm_expires_at TIMESTAMP,

  UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_devices_user_seen
  ON user_devices (user_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_devices_token
  ON user_devices (confirm_token) WHERE confirm_token IS NOT NULL;

-- Колко РАЗЛИЧНИ устройства за 30 дни. Не е същото като max_sessions:
-- едното брои едновременните, другото — редуващите се.
--
-- 4 по подразбиране: телефон, лаптоп, таблет и още едно за смяна на телефона
-- или за компютъра в библиотеката. Пето вече не е един човек.
ALTER TABLE users ADD COLUMN IF NOT EXISTS max_devices_30d INTEGER NOT NULL DEFAULT 4;

-- Последната мрежа, от която е влизано — за засичане на невъзможно движение.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(64);

-- Трета стъпка от прогресивната реакция: „смени си паролата, преди да
-- продължиш“. Не е заключване — изходът е в ръцете на самия човек.
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

-- Докога сигналите се смятат за уредени.
--
-- Без тази колона се получава капан: човекът си сменя паролата, както е
-- поискано, но старите сигнали още стоят и при следващия вход искането се
-- връща — и така до безкрай. Смяната на паролата вдига тази дата и всичко
-- отпреди нея спира да се брои. Редовете обаче ОСТАВАТ — историята трябва да
-- се вижда от администратор, дори когато вече не тежи.
ALTER TABLE users ADD COLUMN IF NOT EXISTS signali_ochisteni_do TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_max_devices_razumno') THEN
    ALTER TABLE users
      ADD CONSTRAINT users_max_devices_razumno
      CHECK (max_devices_30d BETWEEN 1 AND 20);
  END IF;
END $$;

-- ------------------------------------------------------------------- сигнали
CREATE TABLE IF NOT EXISTS security_signals (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,

  -- Какво е забелязано:
  --   mnogo-ustrojstva      — нов профил над лимита за 30 дни
  --   nepotvardeno-vlizane  — опит за вход от непотвърдено устройство
  --   teglene-na-edro       — твърде много различни материали за кратко
  --   nevazmozhno-dvizhenie — две мрежи, между които не се стига навреме
  vid         VARCHAR(40) NOT NULL,

  -- 1 = дребно, 3 = сериозно. Сборът за 30 дни решава на коя стъпка е акаунтът.
  tezhest     SMALLINT NOT NULL DEFAULT 1,

  podrobnosti JSONB,
  ip_address  VARCHAR(64),
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signals_user ON security_signals (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_vid  ON security_signals (vid, created_at DESC);
