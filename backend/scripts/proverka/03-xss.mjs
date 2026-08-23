/**
 * XSS проверка в истински браузър върху сглобения сайт.
 *
 * Два независими критерия за всеки товар:
 *   1) ИЗПЪЛНЕНИЕ — задействаме страницата (изпращаме формата, кликаме бутоните)
 *      и гледаме дали чуждият код се е изпълнил.
 *   2) ВНЕДРЯВАНЕ — търсим маркера в *атрибут* на DOM-а. Дори да не сме успели
 *      да го задействаме, присъствието му там значи, че кодът е излязъл от
 *      данните и е станал част от страницата.
 * Тестът пада, ако някой от двата се задейства.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { SITE, naidiBrauzar, paketNaSajta } from './obshto.mjs';

let chromium;
try { ({ chromium } = await paketNaSajta('playwright')); }
catch { console.error('\nЛипсва playwright. Инсталирай го: cd site && npm ci\n'); process.exit(2); }

const KOREN = join(SITE, 'dist');
const TIPOVE = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const MARKER = '__XSS__';

const sarvar = createServer((req, res) => {
  const pat = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  let f = join(KOREN, pat);
  if (!existsSync(f) || pat === '/') f = join(KOREN, 'index.html');
  try {
    res.writeHead(200, { 'Content-Type': TIPOVE[extname(f)] || 'application/octet-stream' });
    res.end(readFileSync(f));
  } catch { res.writeHead(404); res.end('404'); }
});
if (!existsSync(join(KOREN, 'index.html'))) {
  console.error('\nНяма site/dist — сглоби сайта първо: cd site && npm ci && npm run build\n');
  process.exit(2);
}
await new Promise((r) => sarvar.listen(8099, r));

const izp = naidiBrauzar();
const brauzar = await chromium.launch(izp ? { executablePath: izp } : {});
let ok = 0, lo = 0;

/** Търси маркера в който и да е атрибут на страницата. */
const vnedrenVAtribut = () => {
  for (const el of document.querySelectorAll('*')) {
    for (const a of el.attributes) {
      if (a.value.includes('__XSS__')) return `${el.tagName.toLowerCase()}[${a.name}]`;
    }
  }
  return null;
};

async function proba(ime, pat, zadejstvaj) {
  const str = await brauzar.newPage();
  let dialog = false;
  str.on('dialog', async (d) => { dialog = true; await d.dismiss(); });
  try {
    await str.goto('http://localhost:8099' + pat, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await str.waitForTimeout(1100);

    const vAtribut = await str.evaluate(vnedrenVAtribut);
    if (zadejstvaj) { try { await zadejstvaj(str); } catch { /* може да няма какво */ } }
    await str.waitForTimeout(700);
    const izpalnen = await str.evaluate(() => window.__XSS__ === 1);

    if (izpalnen || dialog) { lo++; console.log(`  ❌ ${ime} — ЧУЖДИЯТ КОД СЕ ИЗПЪЛНИ`); }
    else if (vAtribut) { lo++; console.log(`  ❌ ${ime} — кодът е внедрен в ${vAtribut}`); }
    else { ok++; console.log(`  ✅ ${ime}`); }
  } catch (e) {
    lo++; console.log(`  ⚠️  ${ime} — тестът не завърши: ${e.message.split('\n')[0]}`);
  }
  await str.close();
}

const TOVAR_JS = "x');window.__XSS__=1;//";
const enc = encodeURIComponent(TOVAR_JS);

console.log('\n═══ XSS в истински браузър (сглобеният сайт) ═══\n');

await proba('reset-password: излизане от JS низа', `/#/reset-password?token=${enc}`,
  async (p) => {
    await p.fill('input[name="password"]', 'NovaParola123');
    await p.fill('input[name="password2"]', 'NovaParola123');
    await p.evaluate(() => document.querySelector('form')?.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })));
  });

await proba('reset-password: излизане от атрибута',
  '/#/reset-password?token=' + encodeURIComponent('x" onmouseover="window.__XSS__=1'),
  async (p) => { await p.hover('form'); });

await proba('reset-password: класически таг',
  '/#/reset-password?token=' + encodeURIComponent('<img src=x onerror="window.__XSS__=1">'));

await proba('админ панел: subj от URL-а', `/#/admin?tab=content&subj=${enc}`,
  async (p) => { for (const b of await p.$$('button')) { try { await b.click({ timeout: 700 }); } catch {} } });

await proba('админ панел: kind от URL-а', `/#/admin?tab=content&kind=${enc}`,
  async (p) => { for (const b of await p.$$('button')) { try { await b.click({ timeout: 700 }); } catch {} } });

await proba('търсене: отворен таг без затваряне',
  '/#/search?q=' + encodeURIComponent('<img src=x onerror="window.__XSS__=1"'));

// Съхранен товар: име на потребител с HTML вътре
{
  const str = await brauzar.newPage();
  let dialog = false;
  str.on('dialog', async (d) => { dialog = true; await d.dismiss(); });
  try {
    await str.goto('http://localhost:8099/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await str.evaluate(() => {
      for (const k of Object.keys(localStorage)) {
        if (!k.startsWith('pa_')) continue;
        try {
          const v = JSON.parse(localStorage.getItem(k));
          if (v && typeof v === 'object' && v.user) {
            v.user.name = '<img src=x onerror="window.__XSS__=1">';
            localStorage.setItem(k, JSON.stringify(v));
          }
        } catch {}
      }
      const s = JSON.parse(localStorage.getItem('pa_state') || '{}');
      s.user = { email: 'x@y.bg', name: '<img src=x onerror="window.__XSS__=1">' };
      localStorage.setItem('pa_state', JSON.stringify(s));
    });
    await str.goto('http://localhost:8099/#/dashboard', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await str.waitForTimeout(1100);
    const vAtribut = await str.evaluate(vnedrenVAtribut);
    const izpalnen = await str.evaluate(() => window.__XSS__ === 1);
    if (izpalnen || dialog) { lo++; console.log('  ❌ име на потребител с HTML — ЧУЖДИЯТ КОД СЕ ИЗПЪЛНИ'); }
    else if (vAtribut) { lo++; console.log(`  ❌ име на потребител с HTML — внедрен в ${vAtribut}`); }
    else { ok++; console.log('  ✅ име на потребител с HTML'); }
  } catch (e) {
    lo++; console.log(`  ⚠️  име на потребител — тестът не завърши: ${e.message.split('\n')[0]}`);
  }
  await str.close();
}

await brauzar.close();
sarvar.close();
console.log('\n' + '─'.repeat(60));
console.log(`XSS: ${ok} минали · ${lo} паднали`);
process.exit(lo > 0 ? 1 : 0);
