/**
 * Общи помощни неща за проверките. Нищо тук не е вързано за конкретна машина —
 * пътищата се смятат спрямо самия файл, а настройките идват от средата.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const tuk = dirname(fileURLToPath(import.meta.url));

/** Коренът на хранилището (папката, в която са `backend/` и `site/`). */
export const KOREN = resolve(tuk, '..', '..', '..');
export const BACKEND = join(KOREN, 'backend');
export const SITE = join(KOREN, 'site');

export const API = process.env.API_URL || 'http://localhost:3000';

/** Зарежда пакет от node_modules на бекенда, където и да е разположен проектът. */
export function paket(ime) {
  const req = createRequire(join(BACKEND, 'package.json'));
  try {
    return req(ime);
  } catch (e) {
    console.error(`\nЛипсва „${ime}". Инсталирай зависимостите: cd backend && npm ci\n`);
    process.exit(2);
  }
}

/** Спира с ясно съобщение, ако нещо задължително липсва. */
export function iskaPredpostavki() {
  if (!existsSync(join(BACKEND, 'node_modules'))) {
    console.error('\nНяма backend/node_modules. Инсталирай: cd backend && npm ci\n');
    process.exit(2);
  }
  if (!existsSync(join(BACKEND, '.env')) && !process.env.JWT_SECRET) {
    console.error('\nНяма backend/.env и няма JWT_SECRET в средата.'
      + '\nКопирай примерния: cp backend/.env.example backend/.env и попълни стойностите.\n');
    process.exit(2);
  }
}

/**
 * Зарежда пакет от node_modules на сайта (playwright живее там).
 * Node търси пакети спрямо файла, а тези скриптове стоят в backend/ —
 * затова разрешаването е изрично, вместо обикновен import.
 */
export async function paketNaSajta(ime) {
  const req = createRequire(join(SITE, 'package.json'));
  const mod = await import(pathToFileURL(req.resolve(ime)).href);
  // playwright е CommonJS: при import() полезното излиза под `default`.
  return { ...(mod.default || {}), ...mod };
}

/** Чете стойност от backend/.env, без да презаписва вече зададена в средата. */
export function otEnv(kluch, poPodrazbirane = undefined) {
  if (process.env[kluch]) return process.env[kluch];
  const f = join(BACKEND, '.env');
  if (existsSync(f)) {
    for (const red of readFileSync(f, 'utf8').split('\n')) {
      const m = red.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && m[1] === kluch) return m[2].replace(/^["']|["']$/g, '');
    }
  }
  return poPodrazbirane;
}

/** Издава администраторски токен от базата — без да се знае ничия парола. */
export async function adminToken() {
  const jwt = paket('jsonwebtoken');
  const { Client } = paket('pg');
  const c = new Client({
    host: otEnv('DB_HOST', 'localhost'),
    port: parseInt(otEnv('DB_PORT', '5432'), 10),
    user: otEnv('DB_USER', 'postgres'),
    password: otEnv('DB_PASSWORD', 'postgres'),
    database: otEnv('DB_NAME', 'pravo_academy'),
  });
  await c.connect();
  const r = await c.query(
    "SELECT id, email, role, token_version FROM users WHERE role='admin' AND is_active=true LIMIT 1",
  );
  await c.end();
  if (!r.rows.length) {
    console.error('\nВ базата няма активен администратор — проверката не може да продължи.\n');
    process.exit(2);
  }
  const u = r.rows[0];

  // Откакто токенът носи номер на сесия (виж миграция 012), токен без такъв
  // номер се отхвърля. Затова тук се отваря истински ред в user_sessions —
  // проверката трябва да минава по същия път като истинския потребител,
  // иначе тества нещо, което не съществува.
  const c2 = new Client({
    host: otEnv('DB_HOST', 'localhost'),
    port: parseInt(otEnv('DB_PORT', '5432'), 10),
    user: otEnv('DB_USER', 'postgres'),
    password: otEnv('DB_PASSWORD', 'postgres'),
    database: otEnv('DB_NAME', 'pravo_academy'),
  });
  await c2.connect();
  const ses = await c2.query(
    `INSERT INTO user_sessions (user_id, device_id, device_label, expires_at)
     VALUES ($1, 'proverka', 'Проверка', NOW() + interval '2 hours')
     RETURNING id`,
    [u.id],
  );
  await c2.end();

  return jwt.sign(
    { user_id: u.id, email: u.email, role: u.role, tv: u.token_version ?? 0, sid: ses.rows[0].id },
    otEnv('JWT_SECRET'),
    { expiresIn: '1h' },
  );
}

/** Намира браузър за проверките в реален браузър. */
export function naidiBrauzar() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const koreni = [process.env.PLAYWRIGHT_BROWSERS_PATH, join(process.env.HOME || '', '.cache/ms-playwright')]
    .filter(Boolean);
  for (const k of koreni) {
    if (!existsSync(k)) continue;
    for (const d of readdirSync(k).filter((x) => x.startsWith('chromium-'))) {
      for (const p of ['chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
        'chrome-win/chrome.exe']) {
        const f = join(k, d, p);
        if (existsSync(f)) return f;
      }
    }
  }
  return null; // playwright ще си намери сам
}

/**
 * Адрес, от който „идва“ тази проверка.
 *
 * Лимитът на опитите за вход брои по адрес. Всички проверки удрят сървъра от
 * localhost, тоест делят една и съща квота: една проверка изчерпва квотата и
 * следващата получава 429, без да е сгрешила нищо. Затова всеки скрипт си
 * задава собствен адрес — както биха били различни хора.
 *
 * Работи, защото сървърът е с `trust proxy` (стои зад nginx на живо).
 */
let IP_NA_PROVERKATA = null;
export function zadajIP(ip) { IP_NA_PROVERKATA = ip; }

export async function zaqvka(pat, opt = {}) {
  const zagl = { 'Content-Type': 'application/json', ...(opt.headers || {}) };
  if (IP_NA_PROVERKATA && !zagl['X-Forwarded-For']) zagl['X-Forwarded-For'] = IP_NA_PROVERKATA;
  const r = await fetch(API + pat, { ...opt, headers: zagl });
  let telo = {};
  try { telo = await r.json(); } catch { /* празно тяло */ }
  return { status: r.status, telo, headers: r.headers };
}

/** Спира с ясно съобщение, ако лимитът е изчерпан — вместо да гърми по-нататък. */
export function spriPri429(otgovor, ime = 'входът') {
  if (otgovor.status !== 429) return;
  console.error(`\nЛимитът на опитите е изчерпан — ${ime} не може да се провери сега.`);
  console.error('Изчакай 15 минути или рестартирай сървъра и пусни пак.\n');
  process.exit(2);
}

export async function sarvaratRaboti() {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 3000);
    const r = await fetch(API + '/health', { signal: c.signal });
    clearTimeout(t);
    return r.ok;
  } catch { return false; }
}

/** Малък брояч на резултати, общ за всички проверки. */
export function brojach() {
  let ok = 0, lo = 0;
  return {
    da: (ime, detajl) => { ok++; console.log(`  ✅ ${ime}${detajl ? ' — ' + detajl : ''}`); },
    ne: (ime, detajl) => { lo++; console.log(`  ❌ ${ime}${detajl ? ' — ' + detajl : ''}`); },
    propusni: (ime, zashto) => console.log(`  ⏭️  ${ime}${zashto ? ' — ' + zashto : ''}`),
    kraj: (zaglavie) => {
      console.log('\n' + '─'.repeat(60));
      console.log(`${zaglavie}: ${ok} минали · ${lo} паднали`);
      return lo;
    },
  };
}
