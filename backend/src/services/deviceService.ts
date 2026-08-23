/**
 * Регистър на устройствата.
 *
 * ЗАЩО СЪЩЕСТВУВА
 * Ограничението „едно устройство наведнъж“ (виж sessionService) спира
 * едновременното ползване, но не и редуването: четирима души на един акаунт
 * просто се редуват и никой не е онлайн заедно с друг.
 *
 * Тук се брои друго — колко РАЗЛИЧНИ устройства е видял акаунтът за 30 дни.
 * Над лимита новото устройство не се отказва, а се потвърждава по имейл.
 * Разликата е важна: човекът със сменен телефон минава с едно кликване,
 * защото пощата е негова. Петият в курса — не, защото пощата не е негова.
 *
 * Това е и най-евтината защита срещу открадната парола, която платформата
 * може да има: паролата без достъп до пощата не стига за нов вход.
 */
import crypto from 'crypto';
import { db } from '../db';
import { zapishiSignal } from './signalService';

/** Изключвател за средите, в които това само пречи. */
const VKLYUCHENO = process.env.DEVICE_LIMIT_ENABLED !== 'false';

/** Колко дълго важи кодът за потвърждение на устройство. */
const KOD_CHASOVE = parseInt(process.env.DEVICE_CONFIRM_HOURS || '24', 10);

/** Прозорецът, в който се броят различните устройства. */
const PROZOREC_DNI = parseInt(process.env.DEVICE_WINDOW_DAYS || '30', 10);

export type RezultatOtRegistraciya =
  | { vid: 'bez-nomer' }
  | { vid: 'poznato' }
  | { vid: 'novo'; label: string }
  | { vid: 'chaka-potvarzhdenie'; kod: string; label: string; broj: number; limit: number };

function hashKod(kod: string): string {
  return crypto.createHash('sha256').update(kod).digest('hex');
}

/**
 * Регистрира устройството при успешен вход и решава дали то може да влезе.
 *
 * Вика се СЛЕД проверката на паролата. Преди нея всеки с чужд имейл би могъл
 * да пълни регистъра на жертвата с измислени устройства и да я изкара над
 * лимита — тоест защитата би станала оръжие срещу собственика.
 */
export async function registrirajUstrojstvo(opts: {
  userId: string;
  deviceId?: string | null;
  label: string;
  ip?: string;
}): Promise<RezultatOtRegistraciya> {
  const { userId, deviceId, label } = opts;
  const ip = opts.ip || null;

  // Браузър без хранилище (частен режим при някои) не носи номер. Тогава
  // няма какво да се брои — влизането минава, а едновременният лимит
  // продължава да важи. По-добре отколкото да заключим честен човек заради
  // настройка на браузъра му.
  if (!VKLYUCHENO || !deviceId) return { vid: 'bez-nomer' };

  const red = await db.oneOrNone<{ id: string; confirmed_at: Date | null }>(
    'SELECT id, confirmed_at FROM user_devices WHERE user_id = $1 AND device_id = $2',
    [userId, deviceId]
  );

  // Познато и потвърдено устройство — обичайният случай, нищо не се случва.
  if (red && red.confirmed_at) {
    await db.none(
      'UPDATE user_devices SET last_seen_at = NOW(), last_ip = $2, label = $3 WHERE id = $1',
      [red.id, ip, label]
    );
    return { vid: 'poznato' };
  }

  const broj = await brojRazlichniUstrojstva(userId);
  const limit = await limitZaAkaunt(userId);

  // Познато, но още непотвърдено: човекът е получил кода и опитва пак, без
  // да го е отворил. Кодът се издава наново — старият може вече да е изтекъл.
  if (red && !red.confirmed_at) {
    const kod = crypto.randomBytes(24).toString('hex');
    await db.none(
      `UPDATE user_devices
          SET confirm_token = $2, confirm_expires_at = NOW() + ($3 || ' hours')::interval,
              last_ip = $4, label = $5
        WHERE id = $1`,
      [red.id, hashKod(kod), String(KOD_CHASOVE), ip, label]
    );
    await zapishiSignal(userId, 'nepotvardeno-vlizane', 1, { label }, ip || undefined);
    return { vid: 'chaka-potvarzhdenie', kod, label, broj, limit };
  }

  // Ново устройство под лимита: вписва се като потвърдено и толкова.
  if (broj < limit) {
    await db.none(
      `INSERT INTO user_devices (user_id, device_id, label, last_ip, confirmed_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (user_id, device_id) DO UPDATE
         SET last_seen_at = NOW(), last_ip = EXCLUDED.last_ip, label = EXCLUDED.label`,
      [userId, deviceId, label, ip]
    );
    return { vid: 'novo', label };
  }

  // Ново устройство НАД лимита: вписва се непотвърдено и чака имейл.
  const kod = crypto.randomBytes(24).toString('hex');
  await db.none(
    `INSERT INTO user_devices (user_id, device_id, label, last_ip, confirm_token, confirm_expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + ($6 || ' hours')::interval)
     ON CONFLICT (user_id, device_id) DO UPDATE
       SET confirm_token = EXCLUDED.confirm_token,
           confirm_expires_at = EXCLUDED.confirm_expires_at,
           last_ip = EXCLUDED.last_ip, label = EXCLUDED.label`,
    [userId, deviceId, label, ip, hashKod(kod), String(KOD_CHASOVE)]
  );
  await zapishiSignal(userId, 'mnogo-ustrojstva', 2, { broj, limit, label }, ip || undefined);

  return { vid: 'chaka-potvarzhdenie', kod, label, broj, limit };
}

/** Различни устройства за прозореца. Непотвърдените НЕ се броят — иначе
 *  отказаният опит вдига брояча и заключва акаунта все повече сам. */
export async function brojRazlichniUstrojstva(userId: string, dni = PROZOREC_DNI): Promise<number> {
  const r = await db.one<{ n: string }>(
    `SELECT COUNT(*)::text AS n
       FROM user_devices
      WHERE user_id = $1
        AND confirmed_at IS NOT NULL
        AND last_seen_at > NOW() - ($2 || ' days')::interval`,
    [userId, String(dni)]
  );
  return parseInt(r.n, 10) || 0;
}

async function limitZaAkaunt(userId: string): Promise<number> {
  const u = await db.oneOrNone<{ max_devices_30d: number }>(
    'SELECT max_devices_30d FROM users WHERE id = $1',
    [userId]
  );
  return Math.max(1, u?.max_devices_30d || 4);
}

/**
 * Потвърждава устройство по код от имейла.
 *
 * Проверката и отбелязването са ЕДНА заявка — редът се заключва от базата,
 * така че от два едновременни опита с един и същ код минава точно единият.
 */
export async function potvardiUstrojstvo(kod: string): Promise<{ ok: boolean; userId?: string; label?: string }> {
  if (!kod || typeof kod !== 'string') return { ok: false };

  const r = await db.oneOrNone<{ user_id: string; label: string }>(
    `UPDATE user_devices
        SET confirmed_at = NOW(), confirm_token = NULL, confirm_expires_at = NULL,
            last_seen_at = NOW()
      WHERE confirm_token = $1 AND confirm_expires_at > NOW() AND confirmed_at IS NULL
    RETURNING user_id, label`,
    [hashKod(kod)]
  );

  if (!r) return { ok: false };
  return { ok: true, userId: r.user_id, label: r.label };
}

/** Устройствата на акаунта — за екрана в настройките и за админския панел. */
export async function ustrojstvaNaAkaunt(userId: string) {
  return db.manyOrNone<{
    id: string; label: string | null; last_ip: string | null;
    first_seen_at: Date; last_seen_at: Date; confirmed_at: Date | null;
  }>(
    `SELECT id, label, last_ip, first_seen_at, last_seen_at, confirmed_at
       FROM user_devices
      WHERE user_id = $1
      ORDER BY last_seen_at DESC`,
    [userId]
  );
}

/** Забравя устройство — човек, който си е продал лаптопа, освобождава място. */
export async function zabraviUstrojstvo(userId: string, id: string): Promise<boolean> {
  const r = await db.result('DELETE FROM user_devices WHERE id = $1 AND user_id = $2', [id, userId]);
  return (r.rowCount || 0) > 0;
}

/* ==========================================================================
   НЕВЪЗМОЖНО ДВИЖЕНИЕ

   Вход от София и от Варна в рамките на десет минути е един акаунт и две
   тела. Сам по себе си сигналът е слаб — VPN, мобилен оператор, който
   излиза от друг град — затова тежи малко и не блокира нищо. Става силен
   само в комбинация с останалите.

   Истинската геолокация иска база с адреси (MaxMind/GeoLite). Ако пакетът
   `geoip-lite` е инсталиран, се ползва той и се смята истинско разстояние.
   Ако не е — остава груба проверка по мрежа. Така кодът работи и без
   допълнителна инсталация, а щом тя дойде, става точен без промени.
   ========================================================================== */

let geo: any = null;
let geoOpitan = false;
function vzemiGeo(): any {
  if (geoOpitan) return geo;
  geoOpitan = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    geo = require('geoip-lite');
  } catch (e) {
    geo = null;
  }
  return geo;
}

function razstoyanieKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Грубо: една и съща мрежа ли са двата адреса (когато няма геолокация). */
function sashtataMrezha(a: string, b: string): boolean {
  if (a === b) return true;
  const ta = a.split('.');
  const tb = b.split('.');
  if (ta.length === 4 && tb.length === 4) return ta[0] === tb[0] && ta[1] === tb[1];
  // IPv6: сравняваме първите три групи
  return a.split(':').slice(0, 3).join(':') === b.split(':').slice(0, 3).join(':');
}

const MAX_KMH = parseInt(process.env.TRAVEL_MAX_KMH || '900', 10); // самолет
const MIN_MINUTI = parseInt(process.env.TRAVEL_MIN_MINUTES || '10', 10);

/**
 * Проверява предишния вход срещу текущия и записва сигнал, ако разликата не
 * се побира във времето. Записва и новия адрес за следващия път.
 */
export async function proveriDvizhenie(userId: string, ip?: string): Promise<void> {
  if (!VKLYUCHENO || !ip) return;

  const u = await db.oneOrNone<{ last_login_ip: string | null; last_login: Date | null }>(
    'SELECT last_login_ip, last_login FROM users WHERE id = $1',
    [userId]
  );

  const predishen = u?.last_login_ip;
  const kogato = u?.last_login;

  // Записва се винаги — независимо какво е решено по-долу.
  await db.none('UPDATE users SET last_login_ip = $2 WHERE id = $1', [userId, ip]);

  if (!predishen || !kogato || predishen === ip) return;

  const minuti = (Date.now() - new Date(kogato).getTime()) / 60000;
  if (minuti > 60 * 12 || minuti < 0) return;   // цял ден е достатъчен за всяко разстояние

  const g = vzemiGeo();
  if (g) {
    const a = g.lookup(predishen);
    const b = g.lookup(ip);
    if (!a?.ll || !b?.ll) return;
    const km = razstoyanieKm(a.ll, b.ll);
    if (km < 50) return;
    const nuzhni = (km / MAX_KMH) * 60;         // минути при 900 км/ч
    if (minuti + 20 >= nuzhni) return;          // 20 мин толеранс за летище/часови пояс
    await zapishiSignal(userId, 'nevazmozhno-dvizhenie', 2,
      { ot: a.city || a.country, do: b.city || b.country, km: Math.round(km), minuti: Math.round(minuti) }, ip);
    return;
  }

  // Без геолокация: само груба проверка по мрежа. Тежи 1, не 2 — знае се
  // по-малко, значи и твърдението е по-слабо.
  if (minuti <= MIN_MINUTI && !sashtataMrezha(predishen, ip)) {
    await zapishiSignal(userId, 'nevazmozhno-dvizhenie', 1,
      { ot: predishen, do: ip, minuti: Math.round(minuti), bez_geolokaciya: true }, ip);
  }
}
