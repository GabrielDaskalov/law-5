-- ============================================================
-- Миграция 004: добавя роля на потребителите
--
-- ПОПРАВКА: базовата схема нямаше колона role, а auth кодът
-- разчита на нея (admin панел, admin endpoints). Без тази
-- миграция всички потребители са 'student' и админ достъпът
-- не работи.
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'student';

-- Позволени стойности (леко и без ENUM тип — по-лесно за промяна)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('student', 'admin'));

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- За да направиш даден потребител админ:
-- UPDATE users SET role = 'admin' WHERE email = 'your@email.com';
