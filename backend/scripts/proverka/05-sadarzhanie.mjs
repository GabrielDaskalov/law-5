/**
 * Проверка в браузър на трите промени:
 *   1. новият конспект се чете в темата
 *   2. при грешен отговор се обяснява защо е грешен и кой е верният
 *   3. казусът показва всички полета от учебния формат
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { API, SITE, naidiBrauzar, paketNaSajta, sarvaratRaboti } from './obshto.mjs';

let chromium;
try { ({ chromium } = await paketNaSajta('playwright')); }
catch { console.error('\nЛипсва playwright. Инсталирай го: cd site && npm ci\n'); process.exit(2); }

if (!(await sarvaratRaboti())) {
  console.error('\nСървърът не отговаря. Пусни го с `npm run dev` в backend/ и опитай пак.\n');
  process.exit(2);
}

// Снимките помагат при разчитане на провал — слагаме ги на предвидимо място.
const IZHOD = process.env.SNIMKI_DIR || join(tmpdir(), 'lawplus-proverka');
mkdirSync(IZHOD, { recursive: true });

const MAIL = process.env.TEST_EMAIL || 'ui-proba@lawplus.test';
const PAROLA = process.env.TEST_PASS || 'ProbnaParola2026';

const KOREN = join(SITE, 'dist');
if (!existsSync(join(KOREN, 'index.html'))) {
  console.error('\nНяма site/dist — сглоби сайта: cd site && npm ci && npm run build\n');
  process.exit(2);
}
const TIP = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

// статиката се сервира локално, а /api се препраща към бекенда
const sarvar = createServer(async (q, r) => {
  if (q.url.startsWith('/api') || q.url.startsWith('/health')) {
    const res = await fetch(API + q.url, {
      method: q.method,
      // Свой адрес за тази проверка: лимитът на входовете брои по адрес и
      // не бива да се дели с другите проверки — иначе една изчерпва квотата
      // и следващата получава 429, без да е сгрешила нищо.
      // Постоянен номер на устройството: браузърът тук тръгва с празно
      // хранилище при всяко пускане, тоест би изглеждал като НОВО устройство
      // всеки път и след няколко пускания би опрял в месечния лимит — а тази
      // проверка е за съдържанието, не за устройствата.
      headers: {
        ...q.headers, host: new URL(API).host,
        'x-forwarded-for': '203.0.113.5',
        'x-device-id': 'proverka-sadarzhanie',
      },
      body: ['GET', 'HEAD'].includes(q.method) ? undefined : await new Promise((ok) => {
        let b = ''; q.on('data', (c) => (b += c)); q.on('end', () => ok(b));
      }),
    });
    const telo = await res.text();
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
await new Promise((r) => sarvar.listen(8096, r));


const izp = naidiBrauzar();
const b = await chromium.launch(izp ? { executablePath: izp } : {});
const ctx = await b.newContext({ viewport: { width: 1180, height: 1500 } });
const p = await ctx.newPage();
const greshki = [];
p.on('pageerror', (e) => greshki.push(e.message));

// Влизаме през самата форма — така минаваме по истинския път на приложението.
await p.goto('http://localhost:8096/#/login', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2000);
await p.fill('input[name="email"]', MAIL);
await p.fill('input[type="password"]', PAROLA);
await p.click('form button[type="submit"], form button');
await p.waitForTimeout(3500);
const vlqzal = await p.evaluate(() => !!localStorage.getItem('pa_jwt'));
if (!vlqzal) {
  // Най-честата причина не е дефект, а самата защита: ограничителят на
  // опитите за вход е в паметта на процеса и се изчерпва при много пускания.
  const opit = await fetch(API + '/api/auth/login', {
    method: 'POST',
    // същият адрес като на препращането по-горе, иначе диагнозата мери
    // друга квота и казва „401“ там, където истината е „429“
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.5' },
    body: JSON.stringify({ email: MAIL, password: PAROLA }),
  });
  if (opit.status === 429) {
    console.error('\nОграничителят на опитите за вход е задействан (429).'
      + '\nИзчакай 15 минути или рестартирай сървъра — лимитът се пази в паметта.\n');
  } else if (opit.status === 401) {
    console.error(`\nНяма тестов акаунт ${MAIL} с тази парола.`
      + '\nСъздай го по указанието в README.md до този скрипт.\n');
  } else {
    console.error(`\nВходът не мина (статус ${opit.status}).\n`);
  }
  process.exit(2);
}

let ok = 0, lo = 0;
const da = (m, d) => { ok++; console.log(`  ✅ ${m}${d ? ' — ' + d : ''}`); };
const ne = (m, d) => { lo++; console.log(`  ❌ ${m}${d ? ' — ' + d : ''}`); };

// ─────────────────────────────────── 1. конспект
console.log('\n═══ 1. Новият конспект ═══');
// Темата се задава изрично. Без `?chapter=0` екранът отваря последно
// четената тема на този акаунт — тоест резултатът зависи от това какво е
// правил акаунтът преди, и проверката ту минава, ту не.
await p.goto('http://localhost:8096/#/conspect/oblp?chapter=0', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2800);
const t = await p.evaluate(() => document.body.innerText);
const marker = 'Облигационното право е онази част от гражданското право';
if (t.includes(marker)) da('текстът е от новия конспект');
else ne('новият текст не се вижда', t.slice(0, 140).replace(/\n/g, ' '));
const struktura = await p.evaluate(() => ({
  sekcii: document.querySelectorAll('.tp-section').length,
  podzagl: document.querySelectorAll('.tp-podzagl').length,
}));
struktura.sekcii ? da('секции в конспекта', struktura.sekcii + ' бр.') : ne('няма секции');
struktura.podzagl ? da('подзаглавия се открояват', struktura.podzagl + ' бр.') : ne('подзаглавията не се открояват');
await p.screenshot({ path: join(IZHOD, 'ui-konspekt.png'), fullPage: false });

// ─────────────────────────────────── 2. тест
console.log('\n═══ 2. Разбор при грешен отговор ═══');
await p.goto('http://localhost:8096/#/quiz/oblp', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2600);
const start = await p.$('button:has-text("Започни")');
if (start) { await start.click(); await p.waitForTimeout(1800); }

/**
 * Търси се ГРЕШЕН отговор.
 *
 * Дотук се цъкаше първата опция и ако тя случайно се окажеше вярната,
 * проверката минаваше по друг клон и броят проверки се менеше от пускане на
 * пускане. А разборът при грешен отговор е точно това, което трябва да се
 * провери — при верен няма какво да се разглежда.
 *
 * Затова: цъка се, и ако отговорът е верен, се минава на следващия въпрос.
 * Четири опции значи, че вероятността да улучим верния пет пъти подред е под
 * една хилядна.
 */
let razbor = null;
let opitani = 0;
for (; opitani < 6; opitani++) {
  const opcii = await p.$$('#qOptions .quiz-option');
  if (!opcii.length) break;

  await opcii[0].click();
  await p.waitForTimeout(500);
  const proveri = await p.$('button:has-text("Провери")');
  if (proveri) await proveri.click();
  await p.waitForTimeout(2200);

  const r = await p.evaluate(() => {
    const el = document.querySelector('.quiz-explain.qr');
    if (!el) return null;
    const etiketi = [...el.querySelectorAll('.qr-etiket')].map((x) => x.textContent.trim());
    return { txt: el.innerText, etiketi, ima_drugi: !!el.querySelector('.qr-drugi') };
  });

  if (r && !r.txt.includes('Верен отговор')) { razbor = r; break; }

  // Улучен верен отговор — напред към следващия въпрос.
  const napred = await p.$('button:has-text("Следващ")');
  if (!napred) break;
  await napred.click();
  await p.waitForTimeout(1400);
}

if (!razbor) {
  ne('не се стигна до сгрешен отговор', 'опити: ' + (opitani + 1));
} else {
  for (const iskan of ['Твоят отговор', 'Защо е грешен', 'Верният е', 'Защо е верен']) {
    if (razbor.etiketi.includes(iskan)) da(`показва „${iskan}"`);
    else ne(`липсва „${iskan}"`);
  }
  if (razbor.ima_drugi) da('останалите грешни опции са свити отделно');
  else ne('останалите грешни опции не са показани');
  await p.screenshot({ path: join(IZHOD, 'ui-test.png'), fullPage: false });
}

// ─────────────────────────────────── 3. казус
console.log('\n═══ 3. Полетата на казуса ═══');
await p.goto('http://localhost:8096/#/cases/oblp', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2800);
const karta = await p.evaluate(() => {
  const c = document.querySelector('.case-card');
  if (!c) return null;
  return {
    txt: c.innerText,
    podtema: !!c.querySelector('.kz-podtema'),
    nivo: !!c.querySelector('.kz-nivo'),
    chipove: c.querySelectorAll('.kz-chip').length,
    nasoki: !!c.querySelector('.kz-nasoki'),
    etiketi: [...c.querySelectorAll('.kz-etiket')].map((x) => x.textContent.trim()),
  };
});
if (!karta) ne('няма нито един казус на страницата');
else {
  karta.podtema ? da('подтема') : ne('липсва подтема');
  karta.nivo ? da('ниво на трудност') : ne('липсва ниво');
  karta.chipove ? da('ключови понятия', karta.chipove + ' бр.') : ne('липсват ключови понятия');
  karta.nasoki ? da('насоки за решаване (свити)') : ne('липсват насоки');
  for (const x of ['Учебни цели — студентът да може', 'Фактическа обстановка', 'Въпроси']) {
    karta.etiketi.some((e) => e.toLowerCase().startsWith(x.toLowerCase().slice(0, 12)))
      ? da(x) : ne('липсва ' + x);
  }
  // решението
  const btn = await p.$('.case-show-solution');
  if (btn) {
    await btn.click();
    await p.waitForTimeout(2200);
    const sol = await p.evaluate(() => {
      const s = document.querySelector('.case-solution');
      if (!s || s.style.display === 'none') return null;
      return { txt: s.innerText, etiketi: [...s.querySelectorAll('.kz-etiket')].map((x) => x.textContent.trim()) };
    });
    if (!sol) ne('решението не се отвори');
    else {
      da('примерният отговор се зарежда', sol.txt.length + ' знака');
      sol.etiketi.some((e) => e.includes('Кратък извод')) ? da('кратък извод') : ne('липсва кратък извод');
      sol.etiketi.some((e) => e.includes('Често срещани грешки')) ? da('често срещани грешки') : ne('липсват честите грешки');
    }
  }
  await p.screenshot({ path: join(IZHOD, 'ui-kazus.png'), fullPage: false });
}

const kriti = greshki.filter((g) => !/ERR_TUNNEL|Failed to fetch|net::/i.test(g));
if (kriti.length) ne('грешки в конзолата', kriti[0].slice(0, 90)); else da('няма грешки в конзолата');

await b.close();
sarvar.close();
console.log('\n' + '─'.repeat(60));
console.log(`СЪДЪРЖАНИЕ: ${ok} минали · ${lo} паднали`);
process.exit(lo > 0 ? 1 : 0);
