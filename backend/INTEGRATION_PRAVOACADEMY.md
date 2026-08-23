# Law+ — Интеграция сайт ↔ backend

## ВАЖНО: Интеграцията вече е НАПРАВЕНА и тествана

Сайтът (`site/pravoacademy.html`) има вграден интеграционен слой с
**автоматично разпознаване на backend-а**:

- При зареждане сайтът проверява `GET /health`
- **Има сървър** → истински режим: акаунти с JWT, Stripe плащания,
  покупки от базата, автоматична синхронизация на прогреса
- **Няма сървър** → локален demo режим (localStorage), както при
  отваряне на файла с двоен клик

Програмистът НЕ трябва да пише интеграционен код. Остава само настройка (виж по-долу).

## Какво е свързано и проверено на живо (сайт → backend)

| Функция | Как | Проверено |
|---|---|---|
| Регистрация | Формата → `POST /api/auth/register` → JWT в localStorage | ✅ реален акаунт в PostgreSQL |
| Вход | Формата → `POST /api/auth/login` → JWT + профил (име, роля) | ✅ |
| Изход | Чисти JWT + локалния профил | ✅ |
| Покупки | „Купи" → `POST /api/checkout/create-session` → redirect към Stripe Checkout | ✅ потокът тръгва |
| Отключване след плащане | Stripe webhook → база → сайтът тегли `GET /api/me/purchases` при зареждане | ✅ end-to-end със симулиран webhook |
| Прогрес между устройства | Всяка промяна → debounce 4 сек → `PUT /api/me/state`; при вход → `GET /api/me/state` | ✅ качва и сваля |
| AI асистент | Панелът → `POST /api/ai/ask` (с JWT ако има → лимит 30/ден; гост → 5/ден) | ✅ вкл. лимитите |
  (приема и `history: [{role, content}]` — последните реплики от чата, за последователни въпроси)
| Връщане от Stripe | `/#/dashboard?purchase=success` → съобщение + синхронизация | ✅ |

Без сървър всичко пада елегантно към локалния режим — сайтът никога не се чупи.

## Какво остава на програмиста (само настройка, ~1 час)

### 1. Пусни backend-а
```bash
cd backend
cp .env.example .env       # попълни (виж стъпка 2)
npm install
# База: schema.sql + миграции 003,004,005,006,007 (или docker compose — прави го само)
bash scripts/setup.sh      # интерактивно прави всичко
npm run dev
```

### 2. Ключове в .env
| Променлива | Откъде |
|---|---|
| `STRIPE_SECRET_KEY` | dashboard.stripe.com → API keys |
| `STRIPE_WEBHOOK_SECRET` | Dashboard → Webhooks → endpoint `https://домейн/webhooks/stripe`, събития: `checkout.session.completed`, `charge.refunded` |
| `ANTHROPIC_API_KEY` | console.anthropic.com (за AI; или `AI_STUB=1` за демо) |
| `SMTP_USER/PASSWORD` | имейл акаунт (за потвърждения и напомняния) |
| `FRONTEND_URL` | адресът на сайта (за Stripe redirect и линковете в имейлите) |
| `DB_PASSWORD`, `JWT_SECRET` | силни, случайни |

### 3. Къде сочи сайтът
- **Production (препоръчано):** сервирай сайта през nginx-а от `docker-compose.prod.yml` —
  той проксира `/api` и `/webhooks` към backend-а на **същия домейн** → нулева конфигурация,
  сайтът сам се закача.
- **Друг домейн за API:** в конзолата на сайта еднократно:
  `localStorage.setItem('pa_api_url', 'https://api.домейн.bg')`
- **Локална разработка:** сайтът по подразбиране търси `http://localhost:3000`.
- CORS: `CORS_ORIGIN` в .env = домейнът на сайта.

### 4. Тест без Stripe акаунт (2 минути)
```bash
node scripts/simulate-webhook.js checkout.session.completed   # „плаща" пакет krb на демо студента
# отвори сайта → вход student@pravo-academy.bg / Demo1234! → пакетът е отключен
```

## Демо акаунти (от npm run seed)
| Имейл | Парола | Роля |
|---|---|---|
| admin@pravo-academy.bg | Demo1234! | админ |
| student@pravo-academy.bg | Demo1234! | студент |

(Съвпадат с предпопълнените стойности в login формата на сайта.)

## Пълна карта на API-то (за справка)

Auth: `POST /api/auth/register|login|logout|forgot-password|reset-password|change-password`
Профил: `GET/PUT /api/user/profile`, `PUT /api/user/email`, `PUT /api/user/preferences`
Акаунт: `DELETE /api/me` (парола, soft-delete 30 дни), `GET /api/me/export` (GDPR)
Пакети/плащания: `GET /api/packages`, `POST /api/checkout/create-session`, `GET /api/me/purchases`, `POST /webhooks/stripe`
Прогрес: `GET/PUT /api/me/state` (лимит 2 MB)
Съдържание: `GET /api/content` (публично), `PUT /api/admin/content` (админ)
Поддръжка: `POST/GET /api/support/tickets`, админ: `GET /api/admin/tickets`, `POST /api/admin/tickets/:id/reply|close`
AI: `POST /api/ai/ask` (лимити: 30/ден логнат, 5/ден гост)
Настройки: `PUT /api/me/preferences { email_reminders }`
Админ статистика: `GET /api/payments/stats`, `GET /api/subscriptions/metrics`, refund: `POST /api/payments/:id/refund`

Имейл напомняния: тръгват автоматично със сървъра (на 6 часа; праща при 2+ дни
неактивност, не по-често от веднъж на 3 дни; изключване per-user от настройките).

## Какво НЕ трябва да се пипа
- Редът на middleware-ите в `src/index.ts` — webhook route-ът е ПРЕДИ `express.json()`
  (задължително за Stripe подписа).
- Id-тата на дисциплините — съвпадат 1:1 между сайта (SUBJECTS) и базата (packages):
  krb, rpp, ibdp, lat, otp, gpob, vp, oblp, apr, aprc, aps, eul, le, np, nk, nip,
  krim, pds, se, fp, me, mpp (+ bundle).
- Интеграционният слой в сайта (търси "BACKEND ИНТЕГРАЦИЯ" в HTML-а) — работи, тестван е.
