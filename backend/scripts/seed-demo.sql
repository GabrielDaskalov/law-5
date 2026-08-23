-- ============================================================
-- Law+ — демо данни за development/тестване
-- Използване: psql -d pravo_academy -f scripts/seed-demo.sql
--
-- ИЗИСКВА: schema.sql + миграции 003 и 004 да са приложени.
-- ВНИМАНИЕ: Само за development! НЕ пускай на production.
-- ============================================================

-- Демо потребители
-- Парола и за двата акаунта: Demo1234!
INSERT INTO users (id, email, password_hash, name, role)
VALUES
  (
    'a0000000-0000-4000-8000-000000000001',
    'admin@pravo-academy.bg',
    '$2b$10$13We/ZzV4ddZq/WFl7YDMO.b3Kbvlv38OK5iiMVYsYcoo8OF/YyZe',
    'Админ Администраторов',
    'admin'
  ),
  (
    'a0000000-0000-4000-8000-000000000002',
    'student@pravo-academy.bg',
    '$2b$10$13We/ZzV4ddZq/WFl7YDMO.b3Kbvlv38OK5iiMVYsYcoo8OF/YyZe',
    'Иван Иванов',
    'student'
  )
ON CONFLICT (email) DO NOTHING;

-- Демо абонаментни продукти
-- (В production тези се синхронизират от Stripe Dashboard;
--  тук са локални записи за разработка без Stripe акаунт.)
INSERT INTO subscription_products (id, stripe_product_id, stripe_price_id, name, description, price, currency, billing_interval, features, is_active)
VALUES
  (
    'b0000000-0000-4000-8000-000000000001',
    'prod_demo_monthly',
    'price_demo_monthly',
    'Месечен план',
    'Пълен достъп до всички материали — месечно таксуване',
    29.99,
    'BGN',
    'month',
    '["Всички видео лекции", "Конспекти и материали", "Тестове с обяснения", "Реални казуси"]'::jsonb,
    true
  ),
  (
    'b0000000-0000-4000-8000-000000000002',
    'prod_demo_yearly',
    'price_demo_yearly',
    'Годишен план',
    'Пълен достъп + 2 месеца безплатно — годишно таксуване',
    299.99,
    'BGN',
    'year',
    '["Всички видео лекции", "Конспекти и материали", "Тестове с обяснения", "Реални казуси", "2 месеца безплатно"]'::jsonb,
    true
  )
ON CONFLICT (stripe_price_id) DO NOTHING;

-- Демо платежна история за студента (за да не е празна таблицата)
INSERT INTO payments (id, user_id, stripe_payment_id, amount, currency, status, description, created_at)
VALUES
  (
    'c0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000002',
    'pi_demo_000000000001',
    29.99,
    'BGN',
    'completed',
    'Месечен план — Law+',
    NOW() - INTERVAL '30 days'
  ),
  (
    'c0000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000002',
    'pi_demo_000000000002',
    29.99,
    'BGN',
    'completed',
    'Месечен план — Law+',
    NOW()
  )
ON CONFLICT (stripe_payment_id) DO NOTHING;

-- Обобщение
DO $$
BEGIN
  RAISE NOTICE '=========================================';
  RAISE NOTICE 'Демо данните са заредени!';
  RAISE NOTICE '';
  RAISE NOTICE 'Акаунти (парола: Demo1234!):';
  RAISE NOTICE '  admin@pravo-academy.bg   (админ)';
  RAISE NOTICE '  student@pravo-academy.bg (студент)';
  RAISE NOTICE '=========================================';
END $$;
