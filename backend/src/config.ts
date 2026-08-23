import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';

/**
 * ПОПРАВКА (фабрични стойности): фолбекът 'change-me-in-production' означаваше,
 * че забравена променлива на средата не чупи нищо — приложението тръгва с
 * публично известна тайна и всеки може да си подпише токен на админ.
 * Сега: в производство липсващата тайна е фатална грешка; в разработка се
 * генерира случайна при всеки старт (токените от предния старт спират да
 * важат, което е желаното — така никой не свиква с фиксирана слаба тайна).
 */
function resolveJwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv) return fromEnv;

  if (nodeEnv === 'production') {
    throw new Error(
      'JWT_SECRET липсва. Генерирай силна тайна: openssl rand -hex 32'
    );
  }

  const generated = crypto.randomBytes(32).toString('hex');
  console.warn(
    '⚠️  JWT_SECRET липсва — генерирана е временна случайна тайна за тази сесия. ' +
      'Всички издадени токени спират да важат при рестарт. Сложи JWT_SECRET в .env.'
  );
  return generated;
}

/** CORS_ORIGIN може да съдържа няколко домейна, разделени със запетая. */
const corsOrigins: string[] = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export const config = {
  // Server
  nodeEnv,
  port: parseInt(process.env.PORT || '3000', 10),
  apiUrl: process.env.API_URL || 'http://localhost:3000',

  // Database
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    name: process.env.DB_NAME || 'pravo_academy',
    user: process.env.DB_USER || 'postgres',
    // ПОПРАВКА: фолбекът 'postgres' пускаше приложението с фабрична парола.
    password: process.env.DB_PASSWORD || '',
  },

  // JWT
  jwt: {
    secret: resolveJwtSecret(),
    expiration: process.env.JWT_EXPIRATION || '24h',
    refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '7d',
  },

  // Email
  email: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: process.env.EMAIL_FROM || 'noreply@pravo-academy.bg',
  },

  // AWS S3
  aws: {
    region: process.env.AWS_REGION || 'eu-west-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    s3BucketName: process.env.S3_BUCKET_NAME,
  },

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // CORS
  // Целият списък от разрешени домейни — подава се на cors().
  corsOrigins,
  // Основният домейн — ползва се за линкове в имейли и Stripe redirect URL-и,
  // където трябва един конкретен адрес, а не списък.
  corsOrigin: corsOrigins[0],

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    // 100 на 15 мин беше твърде малко дори за един студент — и се броеше по
    // IP, тоест цяла университетска мрежа делеше една квота.
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '600', 10),
    // Четенето на съдържание е леко и често: конспект, карти, тестове.
    contentMaxRequests: parseInt(process.env.RATE_LIMIT_CONTENT_MAX || '2000', 10),
  },

  // Stripe
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    apiVersion: process.env.STRIPE_API_VERSION || '2023-10-16',
  },
};

// Validate required environment variables
export function validateConfig(): void {
  const requiredVars = [
    'DB_HOST',
    'DB_PORT',
    'DB_NAME',
    'DB_USER',
    'JWT_SECRET',
  ];

  if (config.nodeEnv === 'production') {
    requiredVars.push(
      'DB_PASSWORD',
      'CORS_ORIGIN',
      'SMTP_USER',
      'SMTP_PASSWORD',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET'
    );
  }

  // Always warn about missing Stripe keys (they're important for payments)
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('⚠️  STRIPE_SECRET_KEY not configured - payment processing will not work');
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.warn('⚠️  STRIPE_WEBHOOK_SECRET not configured - webhook processing will not work');
  }

  // Липсващите променливи се съобщават ПЪРВИ: „CORS_ORIGIN липсва“ е по-ясно
  // указание от жалба срещу фабричната стойност, която мълчаливо е влязла вместо нея.
  const missing = requiredVars.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    if (config.nodeEnv === 'production') {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    } else {
      console.warn(`Missing environment variables: ${missing.join(', ')}`);
    }
  }

  // ПОПРАВКА: производство със слаба/фабрична тайна = всеки може да си кове токени
  if (config.nodeEnv === 'production') {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-me-in-production' || process.env.JWT_SECRET.length < 32) {
      throw new Error('JWT_SECRET липсва, е фабричният, или е под 32 символа — генерирай силен: openssl rand -hex 32');
    }
  }

  // ПОПРАВКА: production с CORS_ORIGIN=http://localhost:5173 (фабричната стойност)
  // означава, че истинският сайт не може да чете API-то, а нечия локална страница —
  // може. Плюс http:// вместо https:// = токенът пътува в чист вид.
  if (config.nodeEnv === 'production') {
    for (const origin of config.corsOrigins) {
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        throw new Error(
          `CORS_ORIGIN съдържа локален адрес в производство: "${origin}" — сложи истинските домейни на сайта`
        );
      }
      if (!origin.startsWith('https://')) {
        throw new Error(
          `CORS_ORIGIN трябва да започва с https:// в производство, а е: "${origin}"`
        );
      }
    }
  }
}
