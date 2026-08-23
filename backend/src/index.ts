import jwt from 'jsonwebtoken';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config, validateConfig } from './config';
import { testConnection, closeConnection } from './db';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';

// Routes
import authRoutes from './routes/auth';
import subjectsRoutes from './routes/subjects';
import flashcardsRoutes from './routes/flashcards';
import quizRoutes from './routes/quiz';
import conspectRoutes from './routes/conspects';
import lectureRoutes from './routes/lectures';
import caseRoutes from './routes/cases';
import progressRoutes from './routes/progress';
import userRoutes from './routes/user';
import notificationsRoutes from './routes/notifications';
import adminRoutes from './routes/admin';
import searchRoutes from './routes/search';
import docsRoutes from './routes/docs';
import analyticsRoutes from './routes/analytics';
import exportRoutes from './routes/export';
import reportsRoutes from './routes/reports';
import healthRoutes from './routes/health';
import auditRoutes from './routes/audit';
import webhooksRoutes from './routes/webhooks';
import apiKeysRoutes from './routes/apiKeys';
import paymentsRoutes from './routes/payments';
import subscriptionsRoutes from './routes/subscriptions';
import stripeWebhookRoutes from './routes/stripeWebhook';
import checkoutRoutes from './routes/checkout';
import aiRoutes from './routes/ai';
import { StudyReminderService } from './services/studyReminderService';
import { pochistiStariSesii } from './services/sessionService';
import { tegleneNaEdro } from './middleware/tegleneNaEdro';
import supportRoutes from './routes/support';
import accountRoutes from './routes/account';
// Law+ (нов модел на съдържанието, миграция 010)
import contentRoutes from './routes/content.new';
import adminContentRoutes from './routes/adminContent';

const app = express();

// Зад nginx/reverse proxy (production): реалните IP-та идват от X-Forwarded-For.
// Нужно за коректен rate limiting и AI лимитите по IP.
app.set('trust proxy', 1);

// ============================================================================
// VALIDATION & STARTUP
// ============================================================================
validateConfig();

// ============================================================================
// SECURITY & MIDDLEWARE
// ============================================================================

// Security Headers
app.use(helmet());

// CORS
// CORS_ORIGIN приема няколко домейна, разделени със запетая (сайт + поддомейн).
// credentials: false — токенът пътува в заглавката Authorization, бисквитки не
// се ползват. Включен `credentials` само разхлабва политиката без полза.
app.use(
  cors({
    origin: config.corsOrigins,
    credentials: false,
    optionsSuccessStatus: 200,
  })
);

// ============================================================================
// STRIPE WEBHOOKS — ЗАДЪЛЖИТЕЛНО преди express.json()!
// Stripe изисква суровото (raw) body за проверка на подписа.
// Ако express.json() мине първи, body-то става обект и подписът
// никога няма да е валиден.
// ============================================================================
app.use('/webhooks', stripeWebhookRoutes);

// Body Parser
// ПОПРАВКА (DoS): 50mb позволяваше на всеки анонимен да прати огромен payload.
// Голям limit има САМО админ качването на учебно съдържание (PA_DATA ~12MB);
// регистриран е ПРЕДИ глобалния, за да важи само за този път.
app.use('/api/admin/content', express.json({ limit: '25mb' }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

// ============================================================================
// ОГРАНИЧАВАНЕ НА ЗАЯВКИТЕ
//
// ПОПРАВКА: лимитът беше 100 заявки / 15 мин по IP АДРЕС. Два проблема:
//
//  1) Университетска мрежа, общежитие или мобилен оператор извеждат стотици
//     студенти през един и същ адрес. Първите няколко изчерпват квотата и
//     останалите получават „Too Many Requests“, без да са направили нищо.
//  2) Новият фронтенд тегли съдържанието при нужда, вместо всичко наведнъж.
//     Това е смисълът на промяната, но означава повече на брой (и много
//     по-леки) заявки за една сесия.
//
// Затова: броенето е ПО ПОТРЕБИТЕЛ, когато има валиден токен, и по IP само
// за нерегистрираните. Четенето на съдържание има отделен, по-широк лимит —
// то е безобидно; строгите лимити остават там, където има смисъл (вход).
// ============================================================================

/**
 * Кой „харчи“ от квотата: влезлият потребител, иначе адресът.
 *
 * ПОПРАВКА (заобикаляне на лимита): тук стоеше `jwt.decode`, който само
 * разчита съдържанието и НЕ проверява подписа. Всеки можеше да си сглоби
 * токен с произволен `user_id`, да го сменя при всяка заявка и така да има
 * свежа квота всеки път — тоест лимитът не съществуваше.
 * Сега подписът се проверява; фалшив токен пада на ключ по адрес.
 */
function rateKey(req: express.Request): string {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.substring(7), config.jwt.secret, {
        algorithms: ['HS256'],
      }) as { user_id?: string } | null;
      if (payload && payload.user_id) return 'u:' + payload.user_id;
    } catch (e) { /* невалиден или изтекъл токен — пада на адреса */ }
  }
  return 'ip:' + (req.ip || 'unknown');
}

const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  keyGenerator: rateKey,
  message: { success: false, error: 'Too Many Requests', message: 'Твърде много заявки. Опитай отново след малко.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Четенето на учебно съдържание е леко и се случва често. */
const contentLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.contentMaxRequests,
  keyGenerator: rateKey,
  message: { success: false, error: 'Too Many Requests', message: 'Твърде много заявки. Опитай отново след малко.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/content', contentLimiter);
// Отбелязва (без да спира) свалянето на много различни материали за кратко.
app.use('/api/content', tegleneNaEdro);
app.use('/api/', limiter);

// ПОПРАВКА (brute force): строг лимит на чувствителните auth операции —
// 10 опита / 15 мин по IP (глобалните 100 позволяваха отгатване на пароли)
//
// skipSuccessfulRequests: успешният вход не се брои. Иначе в споделена мрежа
// (общежитие, университет, мобилен оператор) десет честни влизания изчерпват
// квотата и следващият студент е заключен, без да е сгрешил нищо. Опитите за
// отгатване са неуспешни по дефиниция — тях лимитът продължава да ги брои.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: { success: false, error: 'Too Many Attempts', message: 'Твърде много опити. Опитай отново след 15 минути.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);
// Кодът за устройство е 24 байта случайност — налучкването е безнадеждно и
// без лимит, но безнадеждното налучкване пак не бива да е безплатно.
app.use('/api/auth/confirm-device', authLimiter);
// ПОПРАВКА: и тези три проверяват парола, тоест стават за отгатване по същия
// начин като входа — а досега им важеше само широкият общ лимит.
app.use('/api/auth/change-password', authLimiter);
app.use('/api/user/email', authLimiter);
// DELETE /api/me иска парола в тялото; GET/POST на /api/me/* (например
// /api/me/purchases) са обикновено четене и не бива да ядат от строгата квота.
app.use('/api/me', (req, res, next) => {
  if (req.method === 'DELETE') return authLimiter(req, res, next);
  next();
});

// Request Logger
app.use(requestLogger);

// ============================================================================
// HEALTH CHECKS
// ============================================================================

// Register health check routes
app.use('/health', healthRoutes);

// Legacy health endpoint (kept for backward compatibility)
app.get('/health-legacy', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  });
});

// ============================================================================
// API ROUTES
// ============================================================================

// Law+ (нов модел): монтират се ПЪРВИ.
// accountRoutes е закачен на голото '/api' и съдържа стария '/content/:id';
// ако мине преди тях, той прихваща новите адреси и връща 401 на публичния
// каталог. adminRoutes пък е по-общ от '/api/admin/content'.
app.use('/api/admin/content', adminContentRoutes);
app.use('/api/content', contentRoutes);

app.use('/api/auth', authRoutes);
app.use('/api', checkoutRoutes); // Law+: /api/packages, /api/checkout/create-session, /api/me/purchases
app.use('/api', supportRoutes);  // Law+: support тикети (user + admin)
app.use('/api', accountRoutes);  // Law+: state sync, съдържание, имейл, изтриване, GDPR export
app.use('/api', aiRoutes);       // Law+: AI асистент (POST /api/ai/ask)
/* ============================================================================
   ИЗКЛЮЧЕНИ СТАРИ МАРШРУТИ ЗА СЪДЪРЖАНИЕ

   ДУПКА, ЗАТВОРЕНА ТУК: `/api/flashcards`, `/api/cases`, `/api/conspects`,
   `/api/lectures`, `/api/quiz`, `/api/subjects` и `/api/search` четяха
   съдържание БЕЗ никаква проверка на вход и покупка. Проверено на живо:
   `GET /api/flashcards` връщаше платени карти на анонимен посетител.
   Тоест paywall-ът на `/api/content/*` се заобикаляше с един друг адрес.

   Освен това `POST /api/conspects` беше отворен за писане без вход.

   Маршрутите не се ползват от нищо: нито старият сайт, нито новият ги вика
   (и двата минават през `/api/content/*` и `/api/me/*`). Затова са
   изключени, а не „закърпени“ — по-малко код в достъпната повърхност.

   Файловете остават в `src/routes/`. Ако някога потрябват, всеки от тях
   първо трябва да мине през същата проверка като `content.new.ts`:
   `assertSubjectAccess` / `assertTopicAccess`.
   ============================================================================ */
// app.use('/api/subjects', subjectsRoutes);
// app.use('/api/flashcards', flashcardsRoutes);
// app.use('/api/quiz', quizRoutes);
// app.use('/api/conspects', conspectRoutes);
// app.use('/api/lectures', lectureRoutes);
// app.use('/api/cases', caseRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/user', userRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/admin', adminRoutes);
// app.use('/api/search', searchRoutes);   // виж бележката по-горе — заменен от /api/content/search
app.use('/api/docs', docsRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/webhooks', webhooksRoutes);
app.use('/api/api-keys', apiKeysRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/subscriptions', subscriptionsRoutes);

// ============================================================================
// 404 HANDLER
// ============================================================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================================
// ERROR HANDLER
// ============================================================================

app.use(errorHandler);

// ============================================================================
// SERVER STARTUP
// ============================================================================

async function start() {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      process.exit(1);
    }

    // Start server
    const server = app.listen(config.port, () => {
      console.log(`
╔════════════════════════════════════════════════════════════╗
║         🏛️  PRAVO ACADEMY BACKEND - v1.0.0               ║
╚════════════════════════════════════════════════════════════╝

📍 Server running on: ${config.apiUrl}
🌍 Environment: ${config.nodeEnv}
📊 Database: ${config.database.name}@${config.database.host}:${config.database.port}

✅ Ready to accept requests
      `);
    });

    /* ========================================================
       ПЕРИОДИЧНИ ЗАДАЧИ
       (Поправка: услугите съществуваха, но никой не ги стартираше.)
       ======================================================== */
    if (config.nodeEnv !== 'test') {
      // Имейл напомняния за учене — на всеки 6 часа + 1 мин след старт
      setInterval(() => {
        StudyReminderService.sendDueReminders().catch((e) =>
          console.error('[jobs] reminders error:', e)
        );
        StudyReminderService.sendAbandonedCheckoutEmails().catch((e) =>
          console.error('[jobs] abandoned cart error:', e)
        );
      }, 6 * 60 * 60 * 1000);
      setTimeout(() => {
        StudyReminderService.sendDueReminders().catch((e) =>
          console.error('[jobs] reminders error:', e)
        );
      }, 60 * 1000);

      // Историята на сесиите се чисти веднъж дневно. Прекратените редове са
      // полезни няколко месеца (оттам се вижда от колко устройства се влиза
      // в даден акаунт), после са само тежест.
      setInterval(() => {
        pochistiStariSesii()
          .then((n) => n && console.log(`[jobs] изчистени стари сесии: ${n}`))
          .catch((e) => console.error('[jobs] session cleanup error:', e));
      }, 24 * 60 * 60 * 1000);
    }

    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('\nSIGTERM received, shutting down gracefully...');
      server.close(async () => {
        await closeConnection();
        process.exit(0);
      });
    });

    process.on('SIGINT', async () => {
      console.log('\nSIGINT received, shutting down gracefully...');
      server.close(async () => {
        await closeConnection();
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start if run directly
if (require.main === module) {
  start();
}

export default app;
