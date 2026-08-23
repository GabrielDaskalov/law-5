#!/usr/bin/env node
/**
 * Задава администраторски достъп в базата.
 *
 *   node backend/scripts/zadaj-admin.mjs <имейл> <парола>
 *
 * Ако акаунтът съществува — вдига го до администратор и сменя паролата.
 * Ако не съществува — създава го.
 *
 * Паролата се подава като аргумент нарочно, вместо да стои в кода: така
 * не влиза в хранилището и не се чете от всеки, който отвори файла.
 * Смяната вдига token_version, тоест всички стари сесии на този акаунт
 * престават да важат веднага.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const tuk = dirname(fileURLToPath(import.meta.url));
const BACKEND = resolve(tuk, '..');
const req = createRequire(join(BACKEND, 'package.json'));

const [imejl, parola] = process.argv.slice(2);
if (!imejl || !parola) {
  console.error('\nУпотреба: node backend/scripts/zadaj-admin.mjs <имейл> <парола>\n');
  process.exit(1);
}
if (parola.length < 10) {
  console.error('\nПаролата е под 10 знака. Избери по-дълга.\n');
  process.exit(1);
}

const env = {};
const f = join(BACKEND, '.env');
if (existsSync(f)) {
  for (const red of readFileSync(f, 'utf8').split('\n')) {
    const m = red.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const vzemi = (k, po) => process.env[k] || env[k] || po;

let bcrypt, Client;
try {
  bcrypt = req('bcryptjs');
  ({ Client } = req('pg'));
} catch (e) {
  console.error('\nЛипсват зависимости. Пусни: cd backend && npm ci\n');
  process.exit(2);
}

const cena = parseInt(vzemi('BCRYPT_COST', '12'), 10);
const db = new Client({
  host: vzemi('DB_HOST', 'localhost'), port: +vzemi('DB_PORT', '5432'),
  user: vzemi('DB_USER', 'postgres'), password: vzemi('DB_PASSWORD', ''),
  database: vzemi('DB_NAME', 'pravo_academy'),
});

try {
  await db.connect();
} catch (e) {
  console.error('\nБазата не отговаря:', e.message);
  console.error('Провери backend/.env или пусни базата.\n');
  process.exit(2);
}

const hash = await bcrypt.hash(parola, cena);
const ima = await db.query('SELECT id FROM users WHERE lower(email) = lower($1)', [imejl]);

if (ima.rows.length) {
  await db.query(
    `UPDATE users
        SET password_hash = $2, role = 'admin', is_active = true,
            failed_login_attempts = 0, locked_until = NULL,
            token_version = token_version + 1, updated_at = NOW()
      WHERE id = $1`,
    [ima.rows[0].id, hash]);
  console.log(`\nАкаунтът ${imejl} е администратор с новата парола.`);
  console.log('Всички стари сесии на този акаунт вече не важат.\n');
} else {
  await db.query(
    `INSERT INTO users (email, password_hash, name, role, is_active)
     VALUES ($1, $2, $3, 'admin', true)`,
    [imejl.toLowerCase(), hash, imejl.split('@')[0]]);
  console.log(`\nСъздаден администратор: ${imejl}\n`);
}

await db.end();
