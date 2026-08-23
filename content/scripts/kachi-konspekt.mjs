#!/usr/bin/env node
/**
 * Качва новия конспект по облигационно право в платформата.
 *
 *   node kachi-konspekt.mjs --probno     # само показва какво ще стане
 *   node kachi-konspekt.mjs              # записва
 *
 * Съпоставянето е по предварително сверена карта (konspekt № → позиция в
 * платформата). Старият конспект на всяка засегната тема се заменя, като
 * замененото остава в дневника на промените.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Пътищата се смятат спрямо самия файл, а не са зашити: скриптът трябва да
// работи и когато проектът стои другаде.
const TUK = dirname(fileURLToPath(import.meta.url));
const BACKEND = process.env.BACKEND_DIR || resolve(TUK, '..', '..', 'backend');
const req = createRequire(BACKEND + '/package.json');
const jwt = req('jsonwebtoken');
const { Client } = req('pg');

const API = process.env.API_URL || 'http://localhost:3000';
const PROBNO = process.argv.includes('--probno');

const env = Object.fromEntries(
  readFileSync(BACKEND + '/.env', 'utf8').split('\n')
    .map((r) => r.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean).map((m) => [m[1], m[2]]),
);

const temi = JSON.parse(readFileSync(resolve(TUK, '..', 'novi-materiali', 'konspekt.json'), 'utf8'));
const karta = JSON.parse(readFileSync(resolve(TUK, '..', 'novi-materiali', 'karta-konspekt.json'), 'utf8'));

const db = new Client({
  host: env.DB_HOST, port: +env.DB_PORT, user: env.DB_USER,
  password: env.DB_PASSWORD, database: env.DB_NAME,
});
await db.connect();

const admin = (await db.query(
  "SELECT id, email, role, token_version FROM users WHERE role='admin' AND is_active=true LIMIT 1")).rows[0];
const token = jwt.sign(
  { user_id: admin.id, email: admin.email, role: admin.role, tv: admin.token_version ?? 0 },
  env.JWT_SECRET, { expiresIn: '2h' });

const plat = (await db.query(
  `SELECT t.id, t.position, t.title
     FROM topics t JOIN subjects s ON s.id = t.subject_id
    WHERE s.code = 'oblp' ORDER BY t.position`)).rows;
const poPoziciia = new Map(plat.map((r) => [r.position, r]));

/**
 * Извлича позоваванията на разпоредби — платформата ги показва отделно.
 *
 * Текстът ги пише групирано: „(чл. 8, чл. 21, чл. 44–62 ЗЗД; чл. 124 ГПК)".
 * Съкращението на закона стои само след ПОСЛЕДНИЯ член от групата, затова
 * групата се разделя по точка и запетая и абревиатурата се прикача към
 * всеки член в нея.
 */
function izvadiRefs(sections) {
  const nam = new Set();
  const skobi = /\(([^)]*чл\.[^)]*)\)/g;
  for (const s of sections) {
    for (const b of s.blocks) {
      const t = b.text || (b.items || []).join(' ');
      for (const m of t.matchAll(skobi)) {
        for (const grupa of m[1].split(';')) {
          // Без \b — в JavaScript границата на дума е по ASCII и кирилицата
          // никога не я задейства, затова \bЗЗД\b не съвпада с нищо.
          const zakon = grupa.trim().match(/([А-Я]{2,6})$/);
          if (!zakon) continue;
          for (const ch of grupa.matchAll(/чл\.\s*(\d+[а-я]?)/g)) {
            nam.add(`чл. ${ch[1]} ${zakon[1]}`);
          }
        }
      }
    }
  }
  return [...nam].slice(0, 100);
}

let zapisani = 0, propusnati = 0;
const redove = [];

for (const t of temi) {
  const poz = karta[String(t.nomer)];
  if (poz === undefined) { propusnati++; continue; }
  const tema = poPoziciia.get(poz);
  if (!tema) { console.log(`  ! №${t.nomer}: няма тема на позиция ${poz}`); propusnati++; continue; }

  const refs = izvadiRefs(t.sections);
  const staro = (await db.query(
    'SELECT word_count FROM topic_conspects WHERE topic_id = $1', [tema.id])).rows[0];

  redove.push({
    nomer: t.nomer, poz, tema: tema.title, sekcii: t.sections.length,
    znaci: t.znaci, refs: refs.length, staro: staro ? staro.word_count : 0,
  });

  if (PROBNO) continue;

  const r = await fetch(`${API}/api/admin/content/topics/${tema.id}/conspect`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ heading: t.heading, sections: t.sections, refs }),
  });
  if (!r.ok) {
    const telo = await r.text();
    console.log(`  ✗ №${t.nomer} → [${poz}] ${tema.title.slice(0, 40)}: ${r.status} ${telo.slice(0, 180)}`);
    continue;
  }
  zapisani++;
}

console.log(`\n${'№'.padEnd(4)}${'поз'.padEnd(5)}тема${' '.repeat(38)}секции  знаци  чл.  беше`);
for (const r of redove) {
  console.log(
    `${String(r.nomer).padEnd(4)}${String(r.poz).padEnd(5)}${r.tema.slice(0, 40).padEnd(42)}` +
    `${String(r.sekcii).padStart(4)}${String(r.znaci).padStart(8)}${String(r.refs).padStart(5)}` +
    `${String(r.staro).padStart(7)}`);
}

console.log(`\nтеми за качване: ${redove.length} · пропуснати: ${propusnati}`);
console.log(PROBNO ? 'ПРОБНО — нищо не е записано' : `записани: ${zapisani}`);

await db.end();
