/**
 * Записва отговорите на API-то, за да може сайтът да работи без сървър.
 *
 * Кара истинския сайт с истинския бекенд, прихваща всяка заявка към /api
 * и я записва. Отделно вади и данните, нужни за проверка на отговорите
 * (верен индекс + обясненията), защото те идват при POST и зависят от
 * подадения отговор.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Пътищата се смятат спрямо самия файл. Тук стояха зашити пътища от машината,
// на която е писан скриптът — на всяка друга той падаше на първия ред.
const TUK = dirname(fileURLToPath(import.meta.url));
const KOREN_NA_PROEKTA = resolve(TUK, '..', '..');
const BACKEND = process.env.BACKEND_DIR || resolve(KOREN_NA_PROEKTA, 'backend');
const SITE = resolve(KOREN_NA_PROEKTA, 'site');

const req = createRequire(resolve(BACKEND, 'package.json'));
const reqSite = createRequire(resolve(SITE, 'package.json'));
const pw = await import(pathToFileURL(reqSite.resolve('playwright')).href);
const chromium = (pw.default || pw).chromium;
const { Client } = req('pg');

const KOREN = resolve(SITE, 'dist');
const TIP = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const zapis = {};                 // път → тяло

const sarvar = createServer(async (q, r) => {
  if (q.url.startsWith('/api') || q.url.startsWith('/health')) {
    const res = await fetch('http://localhost:3000' + q.url, {
      method: q.method,
      headers: { ...q.headers, host: 'localhost:3000' },
      body: ['GET', 'HEAD'].includes(q.method) ? undefined : await new Promise((ok) => {
        let b = ''; q.on('data', (c) => (b += c)); q.on('end', () => ok(b));
      }),
    });
    const telo = await res.text();
    if (q.method === 'GET' && res.ok && q.url.startsWith('/api/content')) {
      zapis[q.url] = telo;
    }
    r.writeHead(res.status, { 'Content-Type': res.headers.get('content-type') || 'application/json' });
    return r.end(telo);
  }
  const p = normalize(decodeURIComponent(q.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  let f = join(KOREN, p);
  if (!existsSync(f) || p === '/') f = join(KOREN, 'index.html');
  try {
    r.writeHead(200, { 'Content-Type': TIP[extname(f)] || 'application/octet-stream' });
    r.end(readFileSync(f));
  } catch { r.writeHead(404); r.end('404'); }
});
await new Promise((r) => sarvar.listen(8093, r));

const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
const p = await ctx.newPage();
const BAZA = 'http://localhost:8093';

async function idi(hash, chakaj = 2200) {
  await p.goto(BAZA + hash, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(chakaj);
  const c = await p.$('button:has-text("Само технически")');
  if (c) { await c.click().catch(() => {}); await p.waitForTimeout(250); }
}

await idi('/#/login');
await p.fill('input[name="email"]', 'ui-proba@lawplus.test');
await p.fill('input[type="password"]', 'ProbnaParola2026');
await p.click('form button[type="submit"], form button');
await p.waitForTimeout(3800);
if (!(await p.evaluate(() => !!localStorage.getItem('pa_jwt')))) {
  console.error('входът не мина — рестартирай сървъра'); await b.close(); sarvar.close(); process.exit(2);
}
console.log('входът мина');

// Каталог, предмет, флашкарти, тестове, казуси
await idi('/#/dashboard', 2600);
await idi('/#/subject/oblp', 2800);
await idi('/#/flashcards/oblp', 2600);
await idi('/#/quiz/oblp', 2600);
await idi('/#/cases/oblp', 3000);

// Всички конспекти — минаваме тема по тема
const broj = await p.evaluate(() => {
  const r = document.querySelectorAll('.tp-toc a, .prog-item, .toc-item');
  return r.length;
});
console.log('теми в програмата:', broj);
for (let i = 0; i < 78; i++) {
  await p.goto(`${BAZA}/#/conspect/oblp?t=${i}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(120);
  await p.evaluate((idx) => {
    const a = document.querySelectorAll('.tp-toc a, .prog-item a, .toc-item a');
    if (a[idx]) a[idx].click();
  }, i).catch(() => {});
  await p.waitForTimeout(360);
  if (i % 15 === 0) console.log('  конспекти:', i);
}

// Решенията на казусите
await idi('/#/cases/oblp', 3000);
const kazusi = await p.$$('.case-show-solution');
console.log('казуси на страницата:', kazusi.length);
for (let i = 0; i < kazusi.length; i++) {
  await kazusi[i].click().catch(() => {});
  if (i % 20 === 0) await p.waitForTimeout(700);
}
await p.waitForTimeout(4000);

await b.close();
sarvar.close();

// Данните за проверката на отговорите идват от базата — при POST зависят
// от подадения индекс, затова ги вадим направо и смятаме в браузъра.
const env = Object.fromEntries(readFileSync(resolve(BACKEND, '.env'), 'utf8')
  .split('\n').map((r) => r.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]));
const db = new Client({ host: env.DB_HOST, port: +env.DB_PORT, user: env.DB_USER,
  password: env.DB_PASSWORD, database: env.DB_NAME });
await db.connect();
const q = await db.query(
  `SELECT q.id, q.correct_index, q.explanation, q.option_explanations, q.method_note
     FROM quiz_items q JOIN subjects s ON s.id = q.subject_id WHERE s.code = 'oblp'`);
const otgovori = {};
for (const r of q.rows) {
  otgovori[r.id] = {
    correctIndex: r.correct_index, explanation: r.explanation,
    optionExplanations: r.option_explanations, methodNote: r.method_note,
  };
}
const k = await db.query(
  `SELECT c.id, c.solution, c.conclusion, c.mistakes
     FROM study_cases c JOIN subjects s ON s.id = c.subject_id WHERE s.code = 'oblp'`);
const resheniya = {};
for (const r of k.rows) {
  resheniya[r.id] = { solution: r.solution, conclusion: r.conclusion, mistakes: r.mistakes ?? [] };
}
await db.end();

writeFileSync(resolve(TUK, 'snimka-api.json'), JSON.stringify({ zapis, otgovori, resheniya }));
const kb = (JSON.stringify({ zapis, otgovori, resheniya }).length / 1024 / 1024).toFixed(1);
console.log(`\nзаписани отговори: ${Object.keys(zapis).length}`);
console.log(`въпроси с ключ: ${Object.keys(otgovori).length} · решения: ${Object.keys(resheniya).length}`);
console.log(`общо: ${kb} MB`);
