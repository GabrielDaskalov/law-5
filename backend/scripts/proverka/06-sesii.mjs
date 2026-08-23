/**
 * Проверка на ограничението „едно устройство в даден момент“.
 *
 * Всеки тест описва какво прави споделящият (или нападателят) и какво трябва
 * да се случи. Работи срещу пуснат локален сървър и истинска база.
 */
import { paket, zaqvka, brojach, sarvaratRaboti, iskaPredpostavki, otEnv, API, zadajIP, spriPri429 } from './obshto.mjs';

// Собствен адрес: лимитът на входовете брои по адрес и не бива да се дели с
// другите проверки (виж zadajIP).
zadajIP('203.0.113.6');

iskaPredpostavki();

const jwt = paket('jsonwebtoken');
const bcrypt = paket('bcryptjs');
const { Client } = paket('pg');
const b = brojach();
const rezultat = (dobre, ime, detajl) => (dobre ? b.da(ime, detajl) : b.ne(ime, detajl));

if (!(await sarvaratRaboti())) {
  console.error('\nСървърът не отговаря. Пусни го с `npm run dev` в backend/ и опитай пак.\n');
  process.exit(2);
}

const PAROLA = 'ProbnaSesiya2026';
const IMEJL_1 = 'sesii-proba1@lawplus.test';
const IMEJL_2 = 'sesii-proba2@lawplus.test';

const db = new Client({
  host: otEnv('DB_HOST', 'localhost'),
  port: parseInt(otEnv('DB_PORT', '5432'), 10),
  user: otEnv('DB_USER', 'postgres'),
  password: otEnv('DB_PASSWORD', 'postgres'),
  database: otEnv('DB_NAME', 'pravo_academy'),
});
await db.connect();

/** Създава (или възстановява) сметка за проверката, за да е чисто началото. */
async function podgotviAkaunt(imejl) {
  const hash = await bcrypt.hash(PAROLA, 10);
  // `max_devices_30d` е вдигнат нарочно: тази проверка е за ЕДНОВРЕМЕННИТЕ
  // устройства, а месечният лимит е друга мярка с отделна проверка (08).
  // Оставен на стойността си по подразбиране, той спира тестовите входове
  // към средата и проверката започва да мери погрешното нещо.
  const r = await db.query(
    `INSERT INTO users (email, password_hash, name, role, is_active, max_sessions, max_devices_30d)
     VALUES ($1, $2, 'Проба сесии', 'student', true, 1, 20)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, is_active = true,
           max_sessions = 1, max_devices_30d = 20,
           must_change_password = false,
           failed_login_attempts = 0, locked_until = NULL
     RETURNING id`,
    [imejl, hash],
  );
  const id = r.rows[0].id;
  await db.query('DELETE FROM user_devices WHERE user_id = $1', [id]);
  await db.query('DELETE FROM security_signals WHERE user_id = $1', [id]);
  await db.query("UPDATE user_sessions SET revoked_at = NOW(), revoked_reason = 'izhod-vsichki' WHERE user_id = $1 AND revoked_at IS NULL", [id]);
  return id;
}

const ID_1 = await podgotviAkaunt(IMEJL_1);
const ID_2 = await podgotviAkaunt(IMEJL_2);

// Първата сметка получава покупка. Без нея тестът за витрината минава
// винаги: акаунт без покупки изглежда еднакво и влязъл, и не.
const PAKET = 'oblp';
await db.query(
  `INSERT INTO purchases (user_id, package_id, amount, status)
   SELECT $1, $2::varchar, 0, 'completed'
    WHERE NOT EXISTS (SELECT 1 FROM purchases WHERE user_id = $1 AND package_id = $2::varchar)`,
  [ID_1, PAKET],
);

/** Влиза с даден идентификатор на устройство. */
async function vlez(imejl, ustrojstvo, parola = PAROLA) {
  return zaqvka('/api/auth/login', {
    method: 'POST',
    headers: { 'X-Device-Id': ustrojstvo, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/120' },
    body: JSON.stringify({ email: imejl, password: parola }),
  });
}
const sTokena = (t) => ({ Authorization: 'Bearer ' + t });

console.log('\n═══ 1. Влизане от първото устройство ═══');
const A = await vlez(IMEJL_1, 'ustrojstvo-A');
spriPri429(A);
rezultat(A.status === 200 && !!A.telo?.data?.token, 'входът минава', 'статус ' + A.status);
rezultat(!!A.telo?.data?.session_id, 'отговорът носи номер на сесия');
rezultat(A.telo?.data?.izhvarleno_ustrojstvo === false, 'нищо не е изхвърлено — това е първото устройство');
{
  const p = jwt.decode(A.telo.data.token);
  rezultat(p && p.sid === A.telo.data.session_id, 'номерът на сесията е и в самия токен');
}
{
  const r = await zaqvka('/api/auth/sessions', { headers: sTokena(A.telo.data.token) });
  rezultat(r.status === 200 && r.telo?.data?.sesii?.length === 1, 'устройство А работи и се вижда в списъка');
}

console.log('\n═══ 2. Второ устройство изхвърля първото ═══');
const B = await vlez(IMEJL_1, 'ustrojstvo-B');
rezultat(B.status === 200, 'второто устройство влиза (не се отказва вход)', 'статус ' + B.status);
rezultat(B.telo?.data?.izhvarleno_ustrojstvo === true, 'отговорът казва, че е изхвърлено друго устройство');
{
  const r = await zaqvka('/api/auth/sessions', { headers: sTokena(A.telo.data.token) });
  rezultat(r.status === 401, 'устройство А вече не минава', 'статус ' + r.status);
  rezultat(String(r.telo?.code || '').startsWith('SESSION_REVOKED'), 'отказът е с код за прекратена сесия', r.telo?.code || '');
  rezultat(/друго устройство/i.test(r.telo?.message || ''), 'съобщението обяснява защо', r.telo?.message || '');
}
{
  const r = await zaqvka('/api/auth/sessions', { headers: sTokena(B.telo.data.token) });
  rezultat(r.status === 200, 'устройство Б работи', 'статус ' + r.status);
}

console.log('\n═══ 3. Витрината също не пуска изхвърленото устройство ═══');
{
  // Публичните маршрути минават през друг слой (optionalAuth). Ако той не
  // проверява сесията, изхвърленият продължава да чете купеното оттам.
  // Маркерът за „този човек е платил" в отговора на витрината.
  const kupeno = (telo) => telo?.access?.granted === true;

  const zhiv = await zaqvka('/api/content/subjects/' + PAKET, { headers: sTokena(B.telo.data.token) });
  const mratav = await zaqvka('/api/content/subjects/' + PAKET, { headers: sTokena(A.telo.data.token) });
  const anonimen = await zaqvka('/api/content/subjects/' + PAKET);

  // Първо: тестът изобщо може ли да различи двете състояния.
  rezultat(kupeno(zhiv.telo) && !kupeno(anonimen.telo),
    'живият токен вижда купеното, анонимният — не');
  rezultat(!kupeno(mratav.telo), 'изхвърленият не вижда купеното');
}

console.log('\n═══ 4. Повторно влизане от СЪЩОТО устройство не се брои за ново ═══');
const B2 = await vlez(IMEJL_1, 'ustrojstvo-B');
rezultat(B2.status === 200, 'повторният вход минава');
rezultat(B2.telo?.data?.izhvarleno_ustrojstvo === false, 'не съобщава за изхвърлено устройство');
{
  const r = await zaqvka('/api/auth/sessions', { headers: sTokena(B2.telo.data.token) });
  rezultat(r.status === 200 && r.telo?.data?.sesii?.length === 1, 'остава едно активно устройство');
  rezultat(r.telo?.data?.sesii?.[0]?.tekushta === true, 'текущото устройство е отбелязано като такова');
  rezultat(!!r.telo?.data?.sesii?.[0]?.device_label, 'устройството има четимо име', r.telo?.data?.sesii?.[0]?.device_label);
}

console.log('\n═══ 5. Чужда сесия не се затваря ═══');
const V = await vlez(IMEJL_2, 'ustrojstvo-V');
{
  const chuzhd = B2.telo.data.session_id;
  const r = await zaqvka('/api/auth/sessions/' + chuzhd, { method: 'DELETE', headers: sTokena(V.telo.data.token) });
  rezultat(r.status === 404, 'чужд номер на сесия не се приема', 'статус ' + r.status);
  const zhiv = await zaqvka('/api/auth/sessions', { headers: sTokena(B2.telo.data.token) });
  rezultat(zhiv.status === 200, 'чуждата сесия е още жива');
}

console.log('\n═══ 6. Подправен токен с чужд номер на сесия ═══');
{
  // Нападателят знае номера на чужда сесия и си подписва токен от свое име,
  // но с него. Ако сесията не се сверява със собственика си, това минава.
  const p = jwt.decode(V.telo.data.token);
  const podpravèn = jwt.sign(
    { user_id: p.user_id, email: p.email, role: p.role, tv: p.tv, sid: B2.telo.data.session_id },
    otEnv('JWT_SECRET'),
    { expiresIn: '1h' },
  );
  const r = await zaqvka('/api/auth/sessions', { headers: sTokena(podpravèn) });
  rezultat(r.status === 401, 'чужд номер на сесия в собствен токен не минава', 'статус ' + r.status);
}

console.log('\n═══ 7. Токен без номер на сесия ═══');
{
  const p = jwt.decode(V.telo.data.token);
  const bezSid = jwt.sign({ user_id: p.user_id, email: p.email, role: p.role, tv: p.tv },
    otEnv('JWT_SECRET'), { expiresIn: '1h' });
  const r = await zaqvka('/api/auth/sessions', { headers: sTokena(bezSid) });
  const grace = process.env.SESSIONS_GRACE === 'true';
  if (grace) b.propusni('токен без сесия', 'SESSIONS_GRACE=true — нарочно се приема');
  else rezultat(r.status === 401 && r.telo?.code === 'SESSION_REQUIRED',
    'токен без сесия се отхвърля', 'статус ' + r.status + ' ' + (r.telo?.code || ''));
}

console.log('\n═══ 8. Два лимита: вдигнат на 2 устройства ═══');
await db.query('UPDATE users SET max_sessions = 2 WHERE id = $1', [ID_1]);
const G = await vlez(IMEJL_1, 'ustrojstvo-G');
{
  rezultat(G.telo?.data?.izhvarleno_ustrojstvo === false, 'при лимит 2 второто устройство не изхвърля първото');
  const r1 = await zaqvka('/api/auth/sessions', { headers: sTokena(B2.telo.data.token) });
  const r2 = await zaqvka('/api/auth/sessions', { headers: sTokena(G.telo.data.token) });
  rezultat(r1.status === 200 && r2.status === 200, 'и двете устройства работят');
  rezultat(r2.telo?.data?.sesii?.length === 2, 'списъкът показва две устройства', String(r2.telo?.data?.sesii?.length));
  rezultat(r2.telo?.data?.limit === 2, 'списъкът съобщава лимита');
}

console.log('\n═══ 9. Изходът сваля само своето устройство ═══');
{
  await zaqvka('/api/auth/logout', { method: 'POST', headers: sTokena(G.telo.data.token) });
  const svoe = await zaqvka('/api/auth/sessions', { headers: sTokena(G.telo.data.token) });
  const drugo = await zaqvka('/api/auth/sessions', { headers: sTokena(B2.telo.data.token) });
  rezultat(svoe.status === 401, 'излязлото устройство пада', 'статус ' + svoe.status);
  rezultat(drugo.status === 200, 'другото устройство остава вътре', 'статус ' + drugo.status);
}

console.log('\n═══ 10. „Изход от всички устройства" ═══');
await db.query('UPDATE users SET max_sessions = 2 WHERE id = $1', [ID_1]);
const D1 = await vlez(IMEJL_1, 'ustrojstvo-D1');
const D2 = await vlez(IMEJL_1, 'ustrojstvo-D2');
{
  await zaqvka('/api/auth/logout-all', { method: 'POST', headers: sTokena(D2.telo.data.token) });
  const a = await zaqvka('/api/auth/sessions', { headers: sTokena(D1.telo.data.token) });
  const c = await zaqvka('/api/auth/sessions', { headers: sTokena(D2.telo.data.token) });
  rezultat(a.status === 401 && c.status === 401, 'падат всички, включително този, който натиска бутона');
}

console.log('\n═══ 11. Смяната на паролата изхвърля всички устройства ═══');
{
  await db.query('UPDATE users SET max_sessions = 1 WHERE id = $1', [ID_2]);
  const stara = await zaqvka('/api/auth/sessions', { headers: sTokena(V.telo.data.token) });
  const nova = 'DrugaProbna2026';
  const r = await zaqvka('/api/auth/change-password', {
    method: 'POST', headers: sTokena(V.telo.data.token),
    body: JSON.stringify({ current_password: PAROLA, new_password: nova }),
  });
  rezultat(stara.status === 200, 'преди смяната устройството е вътре');
  rezultat(r.status === 200, 'паролата се сменя', 'статус ' + r.status);
  const sled = await zaqvka('/api/auth/sessions', { headers: sTokena(V.telo.data.token) });
  rezultat(sled.status === 401, 'след смяната старият токен пада', 'статус ' + sled.status);
  const kolko = await db.query(
    "SELECT COUNT(*)::int AS n FROM user_sessions WHERE user_id = $1 AND revoked_at IS NULL", [ID_2]);
  rezultat(kolko.rows[0].n === 0, 'не остават активни редове в базата', 'останали: ' + kolko.rows[0].n);
}

console.log('\n═══ 12. Броенето на устройства работи ═══');
{
  const n = await db.query(
    `SELECT COUNT(DISTINCT device_id)::int AS n FROM user_sessions
      WHERE user_id = $1 AND created_at > NOW() - interval '30 days'`, [ID_1]);
  rezultat(n.rows[0].n >= 4, 'историята помни различните устройства', 'различни: ' + n.rows[0].n);
}

// Почистване: сметките остават (следващото пускане ги възстановява), но
// сесиите се затварят, за да не влачим боклук в базата.
await db.query("UPDATE user_sessions SET revoked_at = NOW(), revoked_reason = 'izhod-vsichki' WHERE user_id = ANY($1) AND revoked_at IS NULL", [[ID_1, ID_2]]);
await db.end();

process.exit(b.kraj('Сесии и устройства') > 0 ? 1 : 0);
