/**
 * Обхожда всички GET маршрути с валиден админски токен и отчита кои гърмят.
 * Целта не е сигурност, а работоспособност: кои функции биха се счупили в деня,
 * в който платформата тръгне пред реални хора.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { API, BACKEND, adminToken, sarvaratRaboti, iskaPredpostavki } from './obshto.mjs';

iskaPredpostavki();

if (!(await sarvaratRaboti())) {
  console.error('\nСървърът не отговаря. Пусни го с `npm run dev` в backend/ и опитай пак.\n');
  process.exit(2);
}

const T = await adminToken();
const KOREN = join(BACKEND, 'src', 'routes');

// Къде е монтиран всеки файл (от index.ts)
const idx = readFileSync(join(BACKEND, 'src', 'index.ts'), 'utf8');
const montaz = {};
for (const m of idx.matchAll(/^\s*app\.use\('([^']+)',\s*(\w+)Routes\)/gm)) {
  montaz[m[2]] = m[1];
}

const primerni = {
  ':id': '00000000-0000-4000-8000-000000000001',
  ':user_id': '00000000-0000-4000-8000-000000000001',
  ':subject_id': '00000000-0000-4000-8000-000000000001',
  ':itemId': '00000000-0000-4000-8000-000000000001',
  ':caseId': '00000000-0000-4000-8000-000000000001',
  ':topicId': '00000000-0000-4000-8000-000000000001',
  ':key_id': '00000000-0000-4000-8000-000000000001',
  ':webhook_id': '00000000-0000-4000-8000-000000000001',
  ':log_id': '00000000-0000-4000-8000-000000000001',
  ':code': 'oblp',
  ':entity': 'quiz',
  ':entityType': 'quiz',
  ':entityId': '00000000-0000-4000-8000-000000000001',
  ':type': 'quiz',
  ':admin_id': '00000000-0000-4000-8000-000000000001',
  ':task_id': '00000000-0000-4000-8000-000000000001',
  ':invoice_id': 'pi_test',
  ':payment_id': '00000000-0000-4000-8000-000000000001',
  ':content_type': 'quiz',
  ':content_id': '00000000-0000-4000-8000-000000000001',
};

const marshruti = [];
for (const f of readdirSync(KOREN).filter((x) => x.endsWith('.ts'))) {
  const ime = f.replace(/\.ts$/, '').replace(/\.new$/, '');
  const bazi = Object.entries(montaz)
    .filter(([k]) => k.toLowerCase() === ime.toLowerCase().replace(/[^a-z]/gi, '')
      || k.toLowerCase().startsWith(ime.toLowerCase().slice(0, 6)))
    .map(([, v]) => v);
  const baza = bazi[0];
  if (!baza) continue;
  const txt = readFileSync(`${KOREN}/${f}`, 'utf8');
  for (const m of txt.matchAll(/router\.get\(\s*['"]([^'"]+)['"]/g)) {
    let p = m[1];
    for (const [k, v] of Object.entries(primerni)) p = p.split(k).join(v);
    if (p.includes(':')) continue; // непокрит параметър — пропускаме
    marshruti.push({ fajl: f, pat: (baza + (p === '/' ? '' : p)).replace(/\/+/g, '/') });
  }
}

const vidqni = new Set();
const schupeni = [];
let ok = 0, drugi = 0;

for (const r of marshruti) {
  if (vidqni.has(r.pat)) continue;
  vidqni.add(r.pat);
  try {
    const res = await fetch(API + r.pat, { headers: { Authorization: 'Bearer ' + T } });
    let telo = {};
    try { telo = await res.json(); } catch { /* празно */ }
    if (res.status === 500) {
      schupeni.push({ ...r, msg: (telo.message || '').slice(0, 62) });
    } else if (res.status < 400 || res.status === 404) ok++;
    else drugi++;
  } catch (e) { drugi++; }
}

console.log(`\nОбходени: ${vidqni.size} GET маршрута\n`);
console.log(`  работят или връщат коректна грешка : ${ok}`);
console.log(`  връщат 4xx (очаквано)              : ${drugi}`);
console.log(`  ГЪРМЯТ с 500                       : ${schupeni.length}\n`);
if (schupeni.length) {
  console.log('СЧУПЕНИ МАРШРУТИ:');
  for (const s of schupeni) console.log(`  ${s.pat.padEnd(46)} ${s.msg}`);
}

// Маршрутът за продукти в Stripe иска истински ключ — очаквано е да не мине
// на машина за разработка и не се брои за провал.
const istinski = schupeni.filter((s) => !s.pat.includes('/subscriptions/products'));
console.log('\n' + '─'.repeat(60));
console.log(`МАРШРУТИ: ${vidqni.size - istinski.length} наред · ${istinski.length} счупени`);
if (schupeni.length !== istinski.length) {
  console.log('(/api/subscriptions/products е пропуснат — иска истински Stripe ключ)');
}
process.exit(istinski.length > 0 ? 1 : 0);
