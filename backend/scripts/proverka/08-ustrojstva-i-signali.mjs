/**
 * Проверка на месечния лимит на устройствата, потвърждението по имейл,
 * засичането (теглене на едро, невъзможно движение) и прогресивната реакция.
 *
 * Всеки тест описва какво прави споделящият и какво трябва да се случи.
 */
import crypto from 'node:crypto';
import { paket, zaqvka, brojach, sarvaratRaboti, iskaPredpostavki, otEnv, API, zadajIP, spriPri429 } from './obshto.mjs';

// Собствен адрес (виж zadajIP). Проверката за движение си подава свой при
// всяка заявка и не се влияе от този.
zadajIP('203.0.113.8');

iskaPredpostavki();

const bcrypt = paket('bcryptjs');
const { Client } = paket('pg');
const b = brojach();
const rezultat = (dobre, ime, detajl) => (dobre ? b.da(ime, detajl) : b.ne(ime, detajl));

if (!(await sarvaratRaboti())) {
  console.error('\nСървърът не отговаря. Пусни го с `npm run dev` в backend/ и опитай пак.\n');
  process.exit(2);
}

const PAROLA = 'ProbnaSesiya2026';
const db = new Client({
  host: otEnv('DB_HOST', 'localhost'), port: parseInt(otEnv('DB_PORT', '5432'), 10),
  user: otEnv('DB_USER', 'postgres'), password: otEnv('DB_PASSWORD', 'postgres'),
  database: otEnv('DB_NAME', 'pravo_academy'),
});
await db.connect();

/** Чиста сметка за всеки раздел — иначе тестовете се влияят един на друг. */
async function akaunt(imejl, { maxSesii = 9, maxUstrojstva = 4 } = {}) {
  const hash = await bcrypt.hash(PAROLA, 10);
  const r = await db.query(
    `INSERT INTO users (email, password_hash, name, role, is_active, max_sessions, max_devices_30d)
     VALUES ($1, $2, 'Проба', 'student', true, $3, $4)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, is_active = true,
           max_sessions = EXCLUDED.max_sessions, max_devices_30d = EXCLUDED.max_devices_30d,
           failed_login_attempts = 0, locked_until = NULL,
           must_change_password = false, last_login_ip = NULL, last_login = NULL
     RETURNING id`,
    [imejl, hash, maxSesii, maxUstrojstva]);
  const id = r.rows[0].id;
  await db.query('DELETE FROM user_devices WHERE user_id = $1', [id]);
  await db.query('DELETE FROM security_signals WHERE user_id = $1', [id]);
  await db.query("UPDATE user_sessions SET revoked_at = NOW(), revoked_reason='izhod-vsichki' WHERE user_id=$1 AND revoked_at IS NULL", [id]);
  await db.query(
    `INSERT INTO purchases (user_id, package_id, amount, status)
     SELECT $1, 'oblp'::varchar, 0, 'completed'
      WHERE NOT EXISTS (SELECT 1 FROM purchases WHERE user_id=$1 AND package_id='oblp'::varchar)`, [id]);
  return id;
}

const vlez = (imejl, ustrojstvo, ip = '10.0.0.1', parola = PAROLA) =>
  zaqvka('/api/auth/login', {
    method: 'POST',
    headers: { 'X-Device-Id': ustrojstvo, 'X-Forwarded-For': ip,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/120' },
    body: JSON.stringify({ email: imejl, password: parola }),
  });
const sTokena = (t) => ({ Authorization: 'Bearer ' + t });
const signali = async (id) => (await db.query(
  'SELECT vid, tezhest FROM security_signals WHERE user_id = $1 ORDER BY created_at', [id])).rows;

/* ══════════════════════════════════════════════════ 1. Лимит за 30 дни */
console.log('\n═══ 1. Четири устройства минават, петото иска потвърждение ═══');
const IM_A = 'limit-proba@lawplus.test';
const ID_A = await akaunt(IM_A, { maxUstrojstva: 4 });
{
  const vhodove = [];
  for (const n of ['u1', 'u2', 'u3', 'u4']) vhodove.push(await vlez(IM_A, n));
  spriPri429(vhodove[0]);
  rezultat(vhodove.every((v) => v.status === 200), 'първите четири устройства влизат',
    vhodove.map((v) => v.status).join(','));

  const peto = await vlez(IM_A, 'u5');
  rezultat(peto.status === 403, 'петото не влиза', 'статус ' + peto.status);
  rezultat(peto.telo?.code === 'DEVICE_CONFIRM_REQUIRED', 'отказът е с ясен код', peto.telo?.code || '');
  rezultat(/имейл/i.test(peto.telo?.message || ''), 'съобщението обяснява какво да направи',
    (peto.telo?.message || '').slice(0, 60));

  const red = (await db.query(
    'SELECT confirmed_at, confirm_token FROM user_devices WHERE user_id=$1 AND device_id=$2',
    [ID_A, 'u5'])).rows[0];
  rezultat(!!red && !red.confirmed_at && !!red.confirm_token,
    'петото е вписано непотвърдено, с код за потвърждение');

  const s = await signali(ID_A);
  rezultat(s.some((x) => x.vid === 'mnogo-ustrojstva'), 'записан е сигнал за много устройства');
}

console.log('\n═══ 2. Отказаното устройство НЕ вдига брояча ═══');
{
  // Иначе всеки отказан опит доближава акаунта до следващия праг и защитата
  // започва да работи срещу собственика.
  const n = (await db.query(
    'SELECT COUNT(*)::int AS n FROM user_devices WHERE user_id=$1 AND confirmed_at IS NOT NULL',
    [ID_A])).rows[0].n;
  rezultat(n === 4, 'потвърдените остават четири', 'потвърдени: ' + n);

  const pak = await vlez(IM_A, 'u5');
  rezultat(pak.status === 403, 'повторният опит от същото устройство пак иска потвърждение');
  const oshte = (await db.query(
    'SELECT COUNT(*)::int AS n FROM user_devices WHERE user_id=$1 AND confirmed_at IS NOT NULL',
    [ID_A])).rows[0].n;
  rezultat(oshte === 4, 'и пак не вдига броя на потвърдените', 'потвърдени: ' + oshte);
}

console.log('\n═══ 3. Потвърждение по код от имейла ═══');
{
  // Истинският код отива само по имейл. За проверката слагаме известен код
  // направо в базата — в базата и без това стои само хешът му.
  const kod = 'probno-kodche-' + crypto.randomBytes(8).toString('hex');
  const hash = crypto.createHash('sha256').update(kod).digest('hex');
  await db.query(
    `UPDATE user_devices SET confirm_token=$3, confirm_expires_at = NOW() + interval '1 hour'
      WHERE user_id=$1 AND device_id=$2`, [ID_A, 'u5', hash]);

  const gresh = await zaqvka('/api/auth/confirm-device', {
    method: 'POST', body: JSON.stringify({ kod: 'izmislen-kod' }) });
  rezultat(gresh.status >= 400, 'измислен код не минава', 'статус ' + gresh.status);

  const ok = await zaqvka('/api/auth/confirm-device', {
    method: 'POST', body: JSON.stringify({ kod }) });
  rezultat(ok.status === 200, 'истинският код потвърждава устройството', 'статус ' + ok.status);

  const pak = await zaqvka('/api/auth/confirm-device', {
    method: 'POST', body: JSON.stringify({ kod }) });
  rezultat(pak.status >= 400, 'кодът не работи втори път', 'статус ' + pak.status);

  const sled = await vlez(IM_A, 'u5');
  rezultat(sled.status === 200, 'потвърденото устройство вече влиза', 'статус ' + sled.status);

  const n = (await db.query(
    'SELECT COUNT(*)::int AS n FROM user_devices WHERE user_id=$1 AND confirmed_at IS NOT NULL',
    [ID_A])).rows[0].n;
  rezultat(n === 5, 'сега потвърдените са пет', 'потвърдени: ' + n);
}

console.log('\n═══ 4. Забравяне на устройство освобождава място ═══');
{
  const t = (await vlez(IM_A, 'u1')).telo.data.token;
  const spis = await zaqvka('/api/auth/sessions', { headers: sTokena(t) });
  rezultat(spis.telo?.data?.ustrojstva?.length === 5, 'списъкът показва петте устройства',
    String(spis.telo?.data?.ustrojstva?.length));
  rezultat(spis.telo?.data?.limit_ustrojstva === 4, 'списъкът съобщава месечния лимит');

  // Ако регистърът е празен (изключена защита), няма какво да се маха —
  // тестът го съобщава, вместо да гръмне и да отреже останалите проверки.
  const za_mahane = (spis.telo?.data?.ustrojstva || [])[0];
  if (!za_mahane) {
    b.ne('устройството се маха от списъка', 'няма вписани устройства');
    b.ne('останаха четири', 'няма вписани устройства');
  } else {
    const r = await zaqvka('/api/auth/devices/' + za_mahane.id, { method: 'DELETE', headers: sTokena(t) });
    rezultat(r.status === 200, 'устройството се маха от списъка', 'статус ' + r.status);

    const n = (await db.query(
      'SELECT COUNT(*)::int AS n FROM user_devices WHERE user_id=$1', [ID_A])).rows[0].n;
    rezultat(n === 4, 'останаха четири', 'общо: ' + n);
  }
}

/* ══════════════════════════════════════════════ 5. Теглене на едро */
console.log('\n═══ 5. Теглене на едро се отбелязва ═══');
const IM_B = 'edro-proba@lawplus.test';
const ID_B = await akaunt(IM_B);
{
  const t = (await vlez(IM_B, 'edro-1')).telo.data.token;
  const temi = (await db.query(
    `SELECT t.id FROM topics t JOIN subjects s ON s.id = t.subject_id
      WHERE s.code = 'oblp' LIMIT 30`)).rows;
  rezultat(temi.length >= 26, 'има достатъчно теми за проба', 'теми: ' + temi.length);

  for (const r of temi) {
    await zaqvka(`/api/content/topics/${r.id}/conspect`, { headers: sTokena(t) });
  }
  await new Promise((r) => setTimeout(r, 600));

  const s = await signali(ID_B);
  const edro = s.filter((x) => x.vid === 'teglene-na-edro');
  rezultat(edro.length >= 1, 'записан е сигнал за теглене на едро', 'сигнали: ' + edro.length);
  rezultat(edro.length <= 2, 'не залива базата с еднакви сигнали', 'сигнали: ' + edro.length);
}

console.log('\n═══ 6. Четенето на една тема НЕ вдига сигнал ═══');
const IM_C = 'chetene-proba@lawplus.test';
const ID_C = await akaunt(IM_C);
{
  const t = (await vlez(IM_C, 'chetene-1')).telo.data.token;
  const tema = (await db.query(
    `SELECT t.id FROM topics t JOIN subjects s ON s.id = t.subject_id
      WHERE s.code = 'oblp' LIMIT 1`)).rows[0];
  for (let i = 0; i < 30; i++) {
    await zaqvka(`/api/content/topics/${tema.id}/conspect`, { headers: sTokena(t) });
  }
  await new Promise((r) => setTimeout(r, 500));
  const s = await signali(ID_C);
  rezultat(!s.some((x) => x.vid === 'teglene-na-edro'),
    'трийсет пъти една и съща тема не е теглене', 'сигнали: ' + s.length);
}

/* ═════════════════════════════════════════ 7. Невъзможно движение */
console.log('\n═══ 7. Две далечни мрежи за две минути ═══');
const IM_D = 'dvizhenie-proba@lawplus.test';
const ID_D = await akaunt(IM_D);
{
  await vlez(IM_D, 'dv-1', '78.90.11.22');
  await vlez(IM_D, 'dv-1', '212.39.90.15');   // друга мрежа, секунди по-късно
  await new Promise((r) => setTimeout(r, 400));
  const s = await signali(ID_D);
  rezultat(s.some((x) => x.vid === 'nevazmozhno-dvizhenie'),
    'записан е сигнал за невъзможно движение', s.map((x) => x.vid).join(',') || 'няма');
}

console.log('\n═══ 8. Същата мрежа НЕ вдига сигнал ═══');
const IM_E = 'mrezha-proba@lawplus.test';
const ID_E = await akaunt(IM_E);
{
  await vlez(IM_E, 'mr-1', '78.90.11.22');
  await vlez(IM_E, 'mr-1', '78.90.11.99');    // същата мрежа
  await new Promise((r) => setTimeout(r, 400));
  const s = await signali(ID_E);
  rezultat(!s.some((x) => x.vid === 'nevazmozhno-dvizhenie'),
    'смяна на адрес в същата мрежа не е сигнал', s.map((x) => x.vid).join(',') || 'няма');
}

/* ═══════════════════════════════════ 9. Прогресивната реакция */
console.log('\n═══ 9. Стъпките: тихо → съобщение → смени паролата ═══');
const IM_F = 'stepenki-proba@lawplus.test';
const ID_F = await akaunt(IM_F);
const nasipi = (n, t) => db.query(
  `INSERT INTO security_signals (user_id, vid, tezhest)
   SELECT $1, 'mnogo-ustrojstva', $2 FROM generate_series(1, $3)`, [ID_F, t, n]);
{
  // Степен 0: нищо не се вижда.
  let v = await vlez(IM_F, 'st-1');
  rezultat(!v.telo?.data?.preduprezhdenie, 'чист акаунт не получава съобщение');

  // Степен 1 (сбор 3): пак нищо — първата стъпка е тиха нарочно.
  await nasipi(3, 1);
  v = await vlez(IM_F, 'st-1');
  rezultat(!v.telo?.data?.preduprezhdenie, 'на първа стъпка потребителят още не вижда нищо');

  // Степен 2 (сбор 6): съобщение, но достъпът остава.
  await nasipi(3, 1);
  v = await vlez(IM_F, 'st-1');
  rezultat(!!v.telo?.data?.preduprezhdenie, 'на втора стъпка идва съобщение',
    (v.telo?.data?.preduprezhdenie || '').slice(0, 50));
  rezultat(!v.telo?.data?.iska_nova_parola, 'но още не се иска нова парола');
  const rabotiLi = await zaqvka('/api/content/subjects/oblp', { headers: sTokena(v.telo.data.token) });
  rezultat(rabotiLi.status === 200, 'достъпът работи нормално');

  // Степен 3 (сбор 10): иска се смяна на паролата.
  await nasipi(4, 1);
  v = await vlez(IM_F, 'st-1');
  rezultat(v.telo?.data?.iska_nova_parola === true, 'на трета стъпка се иска нова парола');

  const tok = v.telo.data.token;

  // Личните маршрути се отказват направо…
  const spryano = await zaqvka('/api/me/state', { headers: sTokena(tok) });
  rezultat(spryano.status === 403 && spryano.telo?.code === 'PASSWORD_CHANGE_REQUIRED',
    'личните маршрути са спрени до смяната', 'статус ' + spryano.status + ' ' + (spryano.telo?.code || ''));

  // …а витрината е публична и остава отворена, но купеното не се отключва.
  const vitrina = await zaqvka('/api/content/subjects/oblp', { headers: sTokena(tok) });
  rezultat(vitrina.telo?.access?.granted === false,
    'купеното не се отключва до смяната', 'granted: ' + String(vitrina.telo?.access?.granted));

  const vizhda = await zaqvka('/api/auth/sessions', { headers: sTokena(tok) });
  rezultat(vizhda.status === 200, 'екранът с устройствата остава отворен — има изход');

  const smyana = await zaqvka('/api/auth/change-password', {
    method: 'POST', headers: sTokena(tok),
    body: JSON.stringify({ current_password: PAROLA, new_password: 'NovaProbna2026' }) });
  rezultat(smyana.status === 200, 'смяната на паролата минава', 'статус ' + smyana.status);

  const flag = (await db.query('SELECT must_change_password FROM users WHERE id=$1', [ID_F]))
    .rows[0].must_change_password;
  rezultat(flag === false, 'флагът пада след смяната');

  const sled = await vlez(IM_F, 'st-1', '10.0.0.1', 'NovaProbna2026');
  rezultat(sled.status === 200, 'входът с новата парола минава');
  const pak = await zaqvka('/api/content/subjects/oblp', { headers: sTokena(sled.telo.data.token) });
  rezultat(pak.telo?.access?.granted === true, 'достъпът се връща',
    'granted: ' + String(pak.telo?.access?.granted));
}

/* ═══════════════════════════════════════════ 10. Админските справки */
console.log('\n═══ 10. Какво вижда администраторът ═══');
{
  const { adminToken } = await import('./obshto.mjs');
  const admin = await adminToken();

  const spis = await zaqvka('/api/admin/signali?dni=30', { headers: sTokena(admin) });
  rezultat(spis.status === 200, 'списъкът със сигнали се отваря', 'статус ' + spis.status);
  const nashiyat = (spis.telo?.data?.akaunti || []).find((a) => a.email === IM_B);
  rezultat(!!nashiyat, 'акаунтът с теглене на едро е в списъка');

  const dosie = await zaqvka('/api/admin/users/' + ID_B + '/signali', { headers: sTokena(admin) });
  rezultat(dosie.status === 200 && Array.isArray(dosie.telo?.data?.signali),
    'досието на акаунта се отваря');
  rezultat(!!dosie.telo?.data?.stepenka, 'досието показва на коя стъпка е');

  const bez = await zaqvka('/api/admin/signali', {});
  rezultat(bez.status === 401 || bez.status === 403, 'без админ достъп — отказ', 'статус ' + bez.status);

  const lim = await zaqvka('/api/admin/users/' + ID_B + '/max-devices', {
    method: 'PUT', headers: sTokena(admin), body: JSON.stringify({ max_devices_30d: 8 }) });
  rezultat(lim.status === 200, 'лимитът се вдига за конкретен акаунт', 'статус ' + lim.status);

  const glupost = await zaqvka('/api/admin/users/' + ID_B + '/max-devices', {
    method: 'PUT', headers: sTokena(admin), body: JSON.stringify({ max_devices_30d: 999 }) });
  rezultat(glupost.status >= 400, 'безсмислена стойност се отказва', 'статус ' + glupost.status);

  const otmeni = await zaqvka('/api/admin/users/' + ID_F + '/otmeni-iskane', {
    method: 'POST', headers: sTokena(admin), body: JSON.stringify({ ochisti: true }) });
  rezultat(otmeni.status === 200, 'администраторът може да свали искането', 'статус ' + otmeni.status);
  const ostanali = (await db.query(
    'SELECT COUNT(*)::int AS n FROM security_signals WHERE user_id=$1', [ID_F])).rows[0].n;
  rezultat(ostanali === 0, 'и да изчисти историята', 'останали: ' + ostanali);
}

await db.end();
process.exit(b.kraj('Устройства и сигнали') > 0 ? 1 : 0);
