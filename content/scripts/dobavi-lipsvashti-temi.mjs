#!/usr/bin/env node
/**
 * Добавя трите липсващи теми в предмет „Облигационно право" и пренарежда
 * позициите така, че платформата да съвпадне 1:1 с конспекта на Николай.
 *
 *   node dobavi_temi.mjs --probno    # показва какво ще стане
 *   node dobavi_temi.mjs             # записва
 *
 * Позицията е само ред на показване. Всичко останало (прогрес, покупки,
 * въпроси, казуси) сочи темата по нейния uuid, затова пренареждането не
 * къса нищо.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Пътищата се смятат спрямо самия файл, а не са зашити: скриптът трябва да
// работи и когато проектът стои другаде.
const TUK = dirname(fileURLToPath(import.meta.url));
const BACKEND = process.env.BACKEND_DIR || resolve(TUK, '..', '..', 'backend');
const { Client } = createRequire(BACKEND + '/package.json')('pg');
const PROBNO = process.argv.includes('--probno');

const env = Object.fromEntries(
  readFileSync(BACKEND + '/.env', 'utf8').split('\n')
    .map((r) => r.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean)
    .map((m) => [m[1], m[2]]));

const D = JSON.parse(readFileSync(resolve(TUK, '..', 'novi-materiali', 'testove-i-kazusi.json'), 'utf8'));
const zaglavia = new Map(D.map((t) => [t.nomer, t.zaglavie]));
const NOVI = [18, 34, 70];

function slug(s) {
  return s.toLowerCase()
    .replace(/[а-яё]/g, (c) => ({
      а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i',
      й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's',
      т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sht',
      ъ: 'a', ь: '', ю: 'yu', я: 'ya',
    }[c] ?? c))
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 110);
}

const db = new Client({
  host: env.DB_HOST, port: +env.DB_PORT, user: env.DB_USER,
  password: env.DB_PASSWORD, database: env.DB_NAME,
});
await db.connect();

const subj = (await db.query("SELECT id FROM subjects WHERE code='oblp'")).rows[0];
const ima = (await db.query(
  'SELECT id, position, title FROM topics WHERE subject_id=$1 ORDER BY position', [subj.id])).rows;
console.log(`теми сега: ${ima.length}`);

for (const n of NOVI) {
  const e = ima.find((t) => t.title.trim().toLowerCase() === zaglavia.get(n).trim().toLowerCase());
  if (e) { console.log(`  ! №${n} вече съществува — спирам`); await db.end(); process.exit(1); }
}

// Крайният ред: тема с номер N застава на позиция N-1.
const karta = JSON.parse(readFileSync(resolve(TUK, '..', 'novi-materiali', 'karta-pulna.json'), 'utf8'));
const plan = [];
for (let n = 1; n <= 78; n++) {
  if (NOVI.includes(n)) {
    plan.push({ nomer: n, nova: true, title: zaglavia.get(n) });
  } else {
    const pokazan = karta[String(n)];
    const t = ima.find((x) => x.position + 1 === pokazan);
    if (!t) { console.log(`  ! няма тема за №${n} (показан ${pokazan})`); await db.end(); process.exit(1); }
    plan.push({ nomer: n, nova: false, id: t.id, title: t.title, staraPoz: t.position });
  }
}

console.log('\nпромени в реда:');
let mestat = 0;
for (const p of plan) {
  const nova = p.nomer - 1;
  if (p.nova) console.log(`  + №${p.nomer} НОВА  ${p.title.slice(0, 54)}`);
  else if (p.staraPoz !== nova) { mestat++; }
}
console.log(`  · ${mestat} съществуващи теми се преместват с по няколко позиции надолу`);
console.log(`  · общо след промяната: ${plan.length} теми`);

if (PROBNO) { console.log('\nПРОБНО — нищо не е записано'); await db.end(); process.exit(0); }

await db.query('BEGIN');
try {
  // Първо изместваме всичко високо, за да не се блъска в уникалния индекс.
  await db.query('UPDATE topics SET position = position + 1000 WHERE subject_id = $1', [subj.id]);

  for (const p of plan) {
    const poz = p.nomer - 1;
    if (p.nova) {
      await db.query(
        `INSERT INTO topics (subject_id, title, slug, position, order_index, is_published)
         VALUES ($1, $2, $3, $4, $4, true)`,
        [subj.id, p.title, slug(p.title), poz]);
    } else {
      await db.query('UPDATE topics SET position = $2, order_index = $2 WHERE id = $1', [p.id, poz]);
    }
  }
  await db.query('COMMIT');
  console.log('\nзаписано.');
} catch (e) {
  await db.query('ROLLBACK');
  console.error('\nгрешка, нищо не е променено:', e.message);
  await db.end();
  process.exit(1);
}

const sled = (await db.query(
  'SELECT position, title FROM topics WHERE subject_id=$1 ORDER BY position', [subj.id])).rows;
console.log(`теми сега: ${sled.length}`);
for (const n of NOVI) {
  const t = sled.find((x) => x.position + 1 === n);
  console.log(`  №${n}: ${t ? t.title.slice(0, 56) : 'ЛИПСВА'}`);
}
await db.end();
