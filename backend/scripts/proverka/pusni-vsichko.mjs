#!/usr/bin/env node
/**
 * Пуска всички проверки една след друга и отпечатва обобщение.
 *
 *   node backend/scripts/proverka/pusni-vsichko.mjs
 *
 * Изисква: пуснат сървър (backend `npm run dev`), достъпна база и сглобен
 * сайт (`cd site && npm run build`) за проверките в браузър.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const tuk = dirname(fileURLToPath(import.meta.url));

const PROVERKI = [
  // РЕДЪТ Е ВАЖЕН. Проверката за сигурност нарочно изчерпва лимита на
  // опитите за вход (така доказва, че налучкването се спира). След нея
  // никой не може да влезе 15 минути, затова всичко, което иска вход,
  // върви ПРЕДИ нея.
  { fajl: '02-marshruti.mjs', ime: 'Всички маршрути',
    opisanie: 'обхожда всеки GET и търси 500-ки' },
  { fajl: '05-sadarzhanie.mjs', ime: 'Съдържанието се показва',
    opisanie: 'конспект, разбор при грешен отговор, всички полета на казуса' },
  { fajl: '03-xss.mjs', ime: 'XSS в истински браузър',
    opisanie: 'подава товари, които преди се изпълняваха' },
  { fajl: '04-stranici.mjs', ime: 'Страниците се зареждат',
    opisanie: 'нищо не е счупено от поправките' },
  { fajl: '06-sesii.mjs', ime: 'Едно устройство наведнъж',
    opisanie: 'второ влизане изхвърля първото; чужда сесия не се пипа' },
  { fajl: '08-ustrojstva-i-signali.mjs', ime: 'Месечен лимит и засичане',
    opisanie: 'потвърждение по имейл, теглене на едро, невъзможно движение, стъпките' },
  { fajl: '07-ustrojstva-brauzar.mjs', ime: 'Устройства — какво вижда човекът',
    opisanie: 'изхвърленият разбира защо; потвърждение на устройство; лентите' },
  { fajl: '01-sigurnost.mjs', ime: 'Сигурност на сървъра',
    opisanie: 'фалшив токен, изтичане на грешки, заглавки, лимит, SQL товари' },
];

function pusni(fajl) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [join(tuk, fajl)], { stdio: 'inherit' });
    p.on('close', (kod) => resolve(kod ?? 1));
  });
}

const rezultati = [];
for (const pr of PROVERKI) {
  console.log('\n' + '═'.repeat(60));
  console.log(`${pr.ime.toUpperCase()}`);
  console.log(`${pr.opisanie}`);
  console.log('═'.repeat(60));
  rezultati.push({ ...pr, kod: await pusni(pr.fajl) });
}

console.log('\n\n' + '█'.repeat(60));
console.log('ОБОБЩЕНИЕ');
console.log('█'.repeat(60) + '\n');

let lo = 0, propusnati = 0;
for (const r of rezultati) {
  if (r.kod === 0) console.log(`  ✅  ${r.ime}`);
  else if (r.kod === 2) { propusnati++; console.log(`  ⏭️   ${r.ime} — пропусната (липсва предпоставка)`); }
  else { lo++; console.log(`  ❌  ${r.ime}`); }
}

console.log();
if (lo === 0 && propusnati === 0) console.log('Всичко минава.');
else if (lo === 0) console.log(`Всичко пуснато минава. ${propusnati} пропуснати — виж съобщенията по-горе.`);
else console.log(`${lo} проверки падат. Подробностите са в изхода по-горе.`);
console.log();

process.exit(lo > 0 ? 1 : 0);
