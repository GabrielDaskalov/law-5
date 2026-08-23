/**
 * Проверка в истински браузър: какво ВИЖДА човекът, когато акаунтът му бъде
 * ползван от второ устройство.
 *
 * Сървърната проверка (06-sesii.mjs) доказва, че достъпът пада. Тази тук
 * доказва другото — че падането е обяснено, а не изглежда като счупен сайт.
 */
import crypto from 'node:crypto';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { SITE, API, naidiBrauzar, paketNaSajta, paket, otEnv, brojach, sarvaratRaboti, iskaPredpostavki } from './obshto.mjs';

iskaPredpostavki();

let chromium;
try { ({ chromium } = await paketNaSajta('playwright')); }
catch { console.error('\nЛипсва playwright. Инсталирай го: cd site && npm ci\n'); process.exit(2); }

const KOREN = join(SITE, 'dist');
if (!existsSync(join(KOREN, 'index.html'))) {
  console.error('\nНяма site/dist — сглоби сайта първо: cd site && npm ci && npm run build\n');
  process.exit(2);
}
if (!(await sarvaratRaboti())) {
  console.error('\nСървърът не отговаря. Пусни го с `npm run dev` в backend/ и опитай пак.\n');
  process.exit(2);
}

const bcrypt = paket('bcryptjs');
const { Client } = paket('pg');
const b = brojach();
const rezultat = (dobre, ime, detajl) => (dobre ? b.da(ime, detajl) : b.ne(ime, detajl));

const IMEJL = 'ustrojstva-proba@lawplus.test';
const PAROLA = 'ProbnaSesiya2026';

const db = new Client({
  host: otEnv('DB_HOST', 'localhost'), port: parseInt(otEnv('DB_PORT', '5432'), 10),
  user: otEnv('DB_USER', 'postgres'), password: otEnv('DB_PASSWORD', 'postgres'),
  database: otEnv('DB_NAME', 'pravo_academy'),
});
await db.connect();
const hash = await bcrypt.hash(PAROLA, 10);
// Месечният лимит е вдигнат: разделите 1–3 са за едновременните устройства,
// а лимитът за 30 дни се проверява отделно в раздел 4 със свой акаунт.
const u = await db.query(
  `INSERT INTO users (email, password_hash, name, role, is_active, max_sessions, max_devices_30d)
   VALUES ($1, $2, 'Проба устройства', 'student', true, 1, 20)
   ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash,
     is_active = true, max_sessions = 1, max_devices_30d = 20, must_change_password = false,
     failed_login_attempts = 0, locked_until = NULL
   RETURNING id`, [IMEJL, hash]);
const ID = u.rows[0].id;
await db.query('DELETE FROM user_devices WHERE user_id = $1', [ID]);
await db.query('DELETE FROM security_signals WHERE user_id = $1', [ID]);
await db.query("UPDATE user_sessions SET revoked_at = NOW(), revoked_reason = 'izhod-vsichki' WHERE user_id = $1 AND revoked_at IS NULL", [ID]);

/* Статичен сървър за сглобения сайт + препращане на /api към бекенда, за да
   е всичко от един произход (иначе браузърът блокира заявките). */
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const sarvar = createServer(async (q, r) => {
  if (q.url.startsWith('/api') || q.url.startsWith('/health')) {
    const telo = ['GET', 'HEAD'].includes(q.method)
      ? undefined
      : await new Promise((ok) => { let d = ''; q.on('data', (c) => (d += c)); q.on('end', () => ok(d)); });
    // Свой адрес за тази проверка: иначе дели квотата за входове с всички
    // останали проверки и получава 429, без да е сгрешила нищо.
    const res = await fetch(API + q.url, {
      method: q.method,
      headers: { ...q.headers, host: 'localhost', 'x-forwarded-for': '203.0.113.7' },
      body: telo,
    });
    const t = await res.text();
    r.writeHead(res.status, { 'Content-Type': res.headers.get('content-type') || 'application/json' });
    return r.end(t);
  }
  const p = normalize(decodeURIComponent(q.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  let f = join(KOREN, p);
  if (!existsSync(f) || p === '/') f = join(KOREN, 'index.html');
  try { r.writeHead(200, { 'Content-Type': T[extname(f)] || 'application/octet-stream' }); r.end(readFileSync(f)); }
  catch { r.writeHead(404); r.end(); }
});
await new Promise((r) => sarvar.listen(8098, r));
const BAZA = 'http://localhost:8098';

const izp = naidiBrauzar();
const brauzar = await chromium.launch(izp ? { executablePath: izp } : {});

/** Ново устройство = нов контекст: собствено хранилище, собствен номер. */
async function ustrojstvo(ime) {
  const ctx = await brauzar.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log(`     (грешка в ${ime}: ${e.message.slice(0, 70)})`));
  return { ctx, p };
}

async function vlez(p, imejl = IMEJL, parola = PAROLA) {
  await p.goto(BAZA + '/#/login', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  const c = await p.$('button:has-text("Само технически")');
  if (c) { await c.click().catch(() => {}); await p.waitForTimeout(200); }
  await p.fill('input[name="email"]', imejl);
  await p.fill('input[type="password"]', parola);
  await p.click('form button[type="submit"], form button');
  await p.waitForTimeout(3500);
  return p.evaluate(() => !!localStorage.getItem('pa_jwt'));
}

console.log('\n═══ 1. Двете устройства влизат ═══');
const A = await ustrojstvo('А');
const B = await ustrojstvo('Б');
rezultat(await vlez(A.p), 'устройство А влиза');
{
  const vlqzal = await vlez(B.p);
  rezultat(vlqzal, 'устройство Б влиза');
  const kazano = await B.p.evaluate(() =>
    Array.from(document.querySelectorAll('.toast, #toast, [class*="toast"]'))
      .map((n) => n.textContent).join(' '));
  rezultat(/друго(то)? устройство/i.test(kazano), 'Б вижда, че е излязло другото устройство', kazano.slice(0, 60));
}

console.log('\n═══ 2. Устройство А научава защо е отпаднало ═══');
{
  // Отваря екран, който тегли данни от сървъра — там пада.
  await A.p.goto(BAZA + '/#/settings', { waitUntil: 'domcontentloaded' });
  await A.p.waitForTimeout(3000);

  const bezToken = await A.p.evaluate(() => !localStorage.getItem('pa_jwt'));
  rezultat(bezToken, 'токенът на А е изтрит');

  await A.p.waitForTimeout(1200);
  const naEkrana = await A.p.evaluate(() => ({
    hash: location.hash,
    lenta: document.querySelector('.auth-izhod')?.textContent?.trim() || '',
    vsichko: document.getElementById('app')?.textContent || '',
  }));
  rezultat(naEkrana.hash.startsWith('#/login'), 'А е върнато към формата за вход', naEkrana.hash);
  rezultat(/друго устройство/i.test(naEkrana.lenta + naEkrana.vsichko),
    'на екрана пише защо', (naEkrana.lenta || naEkrana.vsichko).slice(0, 70));
}

console.log('\n═══ 3. Екранът „Устройства" в настройките ═══');
{
  await B.p.goto(BAZA + '/#/settings', { waitUntil: 'domcontentloaded' });
  await B.p.waitForTimeout(3500);
  const t = await B.p.evaluate(() => document.getElementById('setUstrojstva')?.textContent || '');
  rezultat(/това устройство/i.test(t), 'текущото устройство е отбелязано');
  rezultat(/Позволени едновременно/i.test(t), 'показва се лимитът');
  rezultat(!/Зарежда се/i.test(t), 'списъкът се е заредил', t.replace(/\s+/g, ' ').slice(0, 80));
}

console.log('\n═══ 4. Лимитът за 30 дни: обяснение, а не „грешна парола" ═══');
const IM_L = 'brauzar-limit@lawplus.test';
{
  const hash2 = await bcrypt.hash(PAROLA, 10);
  const r = await db.query(
    `INSERT INTO users (email, password_hash, name, role, is_active, max_sessions, max_devices_30d)
     VALUES ($1, $2, 'Проба лимит', 'student', true, 9, 1)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, is_active = true,
           max_sessions = 9, max_devices_30d = 1,
           failed_login_attempts = 0, locked_until = NULL, must_change_password = false
     RETURNING id`, [IM_L, hash2]);
  const ID_L = r.rows[0].id;
  await db.query('DELETE FROM user_devices WHERE user_id = $1', [ID_L]);
  await db.query('DELETE FROM security_signals WHERE user_id = $1', [ID_L]);

  // Първо устройство — минава и изяжда единственото място.
  const P = await ustrojstvo('Първо');
  await vlez(P.p, IM_L);

  // Второ устройство — над лимита.
  const V = await ustrojstvo('Второ');
  await vlez(V.p, IM_L);
  await V.p.waitForTimeout(1200);

  const vidyano = await V.p.evaluate(() => ({
    lenta: document.querySelector('.auth-izhod')?.textContent?.trim() || '',
    hash: location.hash,
    vlqzal: !!localStorage.getItem('pa_jwt'),
  }));
  rezultat(!vidyano.vlqzal, 'второто устройство не влиза');
  rezultat(/имейл/i.test(vidyano.lenta), 'на екрана стои обяснение, а не „грешна парола"',
    vidyano.lenta.slice(0, 70));

  // Потвърждаване по линка от имейла.
  const kod = 'brauzar-kod-' + crypto.randomBytes(8).toString('hex');
  const h = crypto.createHash('sha256').update(kod).digest('hex');
  const upd = await db.query(
    `UPDATE user_devices SET confirm_token=$2, confirm_expires_at = NOW() + interval '1 hour'
      WHERE user_id=$1 AND confirmed_at IS NULL RETURNING id`, [ID_L, h]);
  rezultat(upd.rowCount === 1, 'има точно едно устройство, което чака потвърждение',
    'редове: ' + upd.rowCount);

  await V.p.goto(`${BAZA}/#/potvardi-ustrojstvo?kod=${kod}`, { waitUntil: 'domcontentloaded' });
  await V.p.waitForTimeout(2200);
  const potv = await V.p.evaluate(() => document.getElementById('pdStatus')?.textContent || '');
  rezultat(/Готово/i.test(potv), 'страницата потвърждава устройството', potv.slice(0, 60));

  rezultat(await vlez(V.p, IM_L), 'след потвърждението второто устройство влиза');

  await P.ctx.close();
  await V.ctx.close();
}

console.log('\n═══ 5. Лентата с предупреждение (втора стъпка) ═══');
const IM_P = 'brauzar-predupr@lawplus.test';
{
  const hash3 = await bcrypt.hash(PAROLA, 10);
  const r = await db.query(
    `INSERT INTO users (email, password_hash, name, role, is_active, max_sessions, max_devices_30d)
     VALUES ($1, $2, 'Проба лента', 'student', true, 9, 9)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, is_active = true, max_sessions = 9,
           max_devices_30d = 9, must_change_password = false, signali_ochisteni_do = NULL,
           failed_login_attempts = 0, locked_until = NULL
     RETURNING id`, [IM_P, hash3]);
  const ID_P = r.rows[0].id;
  await db.query('DELETE FROM security_signals WHERE user_id = $1', [ID_P]);
  await db.query('DELETE FROM user_devices WHERE user_id = $1', [ID_P]);
  await db.query(
    `INSERT INTO security_signals (user_id, vid, tezhest)
     SELECT $1, 'mnogo-ustrojstva', 1 FROM generate_series(1, 6)`, [ID_P]);

  const S = await ustrojstvo('Лента');
  rezultat(await vlez(S.p, IM_P), 'входът минава — достъпът не е спрян на тази стъпка');
  await S.p.waitForTimeout(1500);
  const lenta = await S.p.evaluate(() => document.getElementById('paPredupr')?.textContent || '');
  rezultat(/необичайно много устройства/i.test(lenta), 'лентата с предупреждението се вижда',
    lenta.slice(0, 60));
  await S.ctx.close();
}

console.log('\n═══ 6. Искане за смяна на паролата (трета стъпка) ═══');
{
  await db.query(
    `INSERT INTO security_signals (user_id, vid, tezhest)
     SELECT id, 'mnogo-ustrojstva', 1 FROM users WHERE email = $1`, [IM_P]);
  await db.query(
    `INSERT INTO security_signals (user_id, vid, tezhest)
     SELECT id, 'mnogo-ustrojstva', 1 FROM users WHERE email = $1`, [IM_P]);
  await db.query(
    `INSERT INTO security_signals (user_id, vid, tezhest)
     SELECT id, 'mnogo-ustrojstva', 1 FROM users WHERE email = $1`, [IM_P]);
  await db.query(
    `INSERT INTO security_signals (user_id, vid, tezhest)
     SELECT id, 'mnogo-ustrojstva', 1 FROM users WHERE email = $1`, [IM_P]);

  const T = await ustrojstvo('Смяна');
  await vlez(T.p, IM_P);
  await T.p.waitForTimeout(2500);
  const kade = await T.p.evaluate(() => ({
    hash: location.hash,
    lenta: document.querySelector('.settings-iska-parola')?.textContent?.trim() || '',
  }));
  rezultat(kade.hash.startsWith('#/settings'), 'човекът е отведен към настройките', kade.hash);
  rezultat(/смени паролата/i.test(kade.lenta), 'над формата пише какво се иска',
    kade.lenta.slice(0, 70));
  await T.ctx.close();
}

await brauzar.close();
sarvar.close();
await db.query("UPDATE user_sessions SET revoked_at = NOW(), revoked_reason = 'izhod-vsichki' WHERE user_id = $1 AND revoked_at IS NULL", [ID]);
await db.end();

process.exit(b.kraj('Устройства в браузър') > 0 ? 1 : 0);
