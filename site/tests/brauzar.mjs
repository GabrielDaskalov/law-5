/**
 * Намира браузър за проверките.
 *
 * ПОПРАВКА: тук стоеше твърд път
 * (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`), който съществуваше
 * само на машината, където бяха писани проверките. На всяка друга те падаха
 * още на първия ред — тоест изглеждаха счупени, без да са.
 *
 * Сега пътят се търси: първо `CHROME_PATH`, после обичайните места на
 * playwright, и накрая се оставя playwright да си намери сам.
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

function naidiBrauzar() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;

  const koreni = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    join(process.env.HOME || '', '.cache/ms-playwright'),
    join(process.env.LOCALAPPDATA || '', 'ms-playwright'),
  ].filter(Boolean);

  for (const k of koreni) {
    if (!existsSync(k)) continue;
    for (const d of readdirSync(k).filter((x) => x.startsWith('chromium-'))) {
      for (const p of [
        'chrome-linux/chrome',
        'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
        'chrome-win/chrome.exe',
      ]) {
        const f = join(k, d, p);
        if (existsSync(f)) return f;
      }
    }
  }
  return null; // playwright ще си намери сам
}

/** Пуска браузър, готов за проверките. */
export async function pusniBrauzar(nastrojki = {}) {
  const izp = naidiBrauzar();
  return chromium.launch({
    args: ['--no-sandbox'],
    ...(izp ? { executablePath: izp } : {}),
    ...nastrojki,
  });
}

/**
 * Папка за снимките на дадена проверка.
 *
 * И тук стояха твърди пътища (`/tmp/e2e`, `/tmp/deep`, `/tmp/adm`…), които
 * работят само на Linux и се губят при рестарт. Сега снимките отиват до
 * самите проверки, в `tests/izhod/<име>`, освен ако не се зададе друго с
 * PROVERKI_IZHOD.
 */
export function papka(ime) {
  const koren = process.env.PROVERKI_IZHOD
    || join(dirname(fileURLToPath(import.meta.url)), 'izhod');
  const p = join(koren, ime);
  mkdirSync(p, { recursive: true });
  return p;
}

/**
 * Тестовият акаунт.
 *
 * Проверките четат имейла и паролата от средата. Досега липсата им не се
 * съобщаваше: `p.fill(undefined)` минава тихо, входът се проваля и надолу
 * гърми всичко — човек вижда десет счупени проверки вместо едно изречение.
 */
export function akaunt() {
  const imejl = process.env.LAWPLUS_TEST_EMAIL;
  const parola = process.env.LAWPLUS_TEST_PASS;
  if (!imejl || !parola) {
    console.error('\nЛипсват данни за тестовия акаунт. Пусни проверката така:\n');
    console.error('  LAWPLUS_TEST_EMAIL=proba@lawplus.test \\');
    console.error('  LAWPLUS_TEST_PASS=... \\');
    console.error('  node tests/01-obikolka.mjs\n');
    console.error('Акаунтът трябва да съществува и да има купено Облигационно право.\n');
    process.exit(2);
  }
  return { imejl, parola };
}

/**
 * Администраторският акаунт за проверката на панела. Същата логика като
 * `akaunt()` — липсата се съобщава с изречение, не с необяснима грешка.
 */
export function admin() {
  const imejl = process.env.LAWPLUS_TEST_ADMIN_EMAIL;
  const parola = process.env.LAWPLUS_TEST_ADMIN_PASS;
  if (!imejl || !parola) {
    console.error('\nЛипсват данни за администраторския акаунт. Пусни така:\n');
    console.error('  LAWPLUS_TEST_ADMIN_EMAIL=admin@... \\');
    console.error('  LAWPLUS_TEST_ADMIN_PASS=... \\');
    console.error('  node tests/03-admin.mjs\n');
    console.error('Администратор се създава с: node backend/scripts/zadaj-admin.mjs <имейл> <парола>\n');
    process.exit(2);
  }
  return { imejl, parola };
}

export { naidiBrauzar };
