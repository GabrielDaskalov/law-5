/**
 * Сесии и устройства.
 *
 * ЗАЩО СЪЩЕСТВУВА
 * Токенът е лист хартия с подпис: който го носи, минава. Сървърът досега не
 * помнеше на кого го е дал, затова един акаунт можеше да работи едновременно
 * на неограничено много устройства — идеалната форма за споделяне.
 *
 * Тук всяко влизане получава ред в базата, а токенът носи номера на своя ред
 * (полето `sid`). Проверката при всяка заявка е: съществува ли редът и жив ли
 * е още. Прекратим ли реда, токенът престава да важи в същия момент, вместо
 * да живее до изтичането си.
 *
 * КАК СЕ ДЪРЖИ ПРИ ВТОРО УСТРОЙСТВО
 * Влизането не се отказва — изхвърля се по-старото устройство. Обратното
 * („този акаунт вече се ползва, опитай пак по-късно“) звучи по-строго, но е
 * по-лошо: човек, който е затворил лаптопа, без да излезе, остава заключен
 * навън от собствения си акаунт, докато сесията изтече. А за споделянето
 * ефектът е един и същ — двама души не могат да учат едновременно.
 *
 * ЦЕНАТА ПРИ ЧЕТЕНЕ
 * Проверката минава през кеш в паметта, също като състоянието на акаунта.
 * Затова прекратената сесия умира с забавяне до TTL-а (при няколко процеса —
 * толкова; в рамките на процеса кешът се чисти веднага). Това е компромисът
 * между „една заявка към базата на всяко кликване“ и „моментално“.
 */
import { db } from '../db';

/** Колко секунди прекратена сесия може още да мине заради кеша. */
const SESSION_CACHE_TTL_MS = parseInt(process.env.SESSION_CACHE_TTL_MS || '20000', 10);

/**
 * `last_seen_at` се пише най-много веднъж на толкова. Иначе всяко кликване
 * става запис в базата — за нищо: полето трябва да отговаря на въпроса
 * „кога това устройство е било активно“, а не да брои кликвания.
 */
const TOUCH_INTERVAL_MS = parseInt(process.env.SESSION_TOUCH_MS || '300000', 10);

/** Колко дълго се пази историята на прекратените сесии. */
const ISTORIYA_DNI = parseInt(process.env.SESSION_HISTORY_DAYS || '180', 10);

export type PrichinaZaPrekratyavane =
  | 'drugo-ustrojstvo'
  | 'nov-vhod'
  | 'izhod'
  | 'izhod-vsichki'
  | 'nova-parola'
  | 'administrator'
  | 'izteklo';

/** Изречението, което вижда потребителят. Кодовете остават за програмиста. */
export const OBYASNENIE: Record<string, string> = {
  'drugo-ustrojstvo': 'Влезе в акаунта от друго устройство. Този достъп беше прекратен.',
  'nov-vhod': 'Влезе отново от това устройство.',
  izhod: 'Излезе от акаунта.',
  'izhod-vsichki': 'Излезе от всички устройства.',
  'nova-parola': 'Паролата беше сменена. Влез отново.',
  administrator: 'Достъпът беше прекратен от администратор.',
  izteklo: 'Сесията изтече. Влез отново.',
};

type SesiyaState = {
  userId: string;
  zhiva: boolean;
  prichina: string | null;
  exp: number;
};
const sesiiCache = new Map<string, SesiyaState>();
const posledenZapis = new Map<string, number>();

/** Маха сесията от кеша — след прекратяване, за да важи веднага. */
export function invalidateSession(sessionId: string): void {
  sesiiCache.delete(sessionId);
  posledenZapis.delete(sessionId);
}

function zabravi(ids: string[]): void {
  for (const id of ids) invalidateSession(id);
}

/** Отрязва подадено отвън поле до разумна дължина. */
function orezhi(v: unknown, n: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, n) : null;
}

/**
 * Човешко име на устройството от User-Agent.
 *
 * Нарочно грубо и нарочно късо: целта е потребителят да разпознае своя
 * телефон в списъка, а не да се строи пръстов отпечатък. Колкото по-малко
 * се пази, толкова по-малко има за изтичане.
 */
export function imeNaUstrojstvo(ua: string | undefined): string {
  const s = String(ua || '');
  if (!s) return 'Неизвестно устройство';

  let brauzar = 'Браузър';
  if (/Edg\//.test(s)) brauzar = 'Edge';
  else if (/OPR\/|Opera/.test(s)) brauzar = 'Opera';
  else if (/Firefox\//.test(s)) brauzar = 'Firefox';
  else if (/Chrome\//.test(s)) brauzar = 'Chrome';
  else if (/Safari\//.test(s)) brauzar = 'Safari';

  let sistema = '';
  if (/iPhone/.test(s)) sistema = 'iPhone';
  else if (/iPad/.test(s)) sistema = 'iPad';
  else if (/Android/.test(s)) sistema = 'Android';
  else if (/Windows/.test(s)) sistema = 'Windows';
  else if (/Mac OS X|Macintosh/.test(s)) sistema = 'Mac';
  else if (/Linux/.test(s)) sistema = 'Linux';

  return sistema ? `${brauzar} на ${sistema}` : brauzar;
}

/**
 * Отваря сесия за успешно влизане и връща номера ѝ.
 *
 * Всичко е в една транзакция, за да не може при две едновременни влизания
 * и двете да преброят „има само една активна“ и двете да останат живи.
 * `FOR UPDATE` върху реда на потребителя ги подрежда една след друга.
 */
export async function otvoriSesiya(opts: {
  userId: string;
  deviceId?: unknown;
  userAgent?: string;
  ip?: string;
  chasove?: number;
}): Promise<{ sessionId: string; izhvarleni: number }> {
  const deviceId = orezhi(opts.deviceId, 64);
  const label = imeNaUstrojstvo(opts.userAgent);
  const chasove = opts.chasove ?? 24;

  const rezultat = await db.tx(async (t) => {
    // Редът на потребителя се заключва за времето на транзакцията: оттук
    // нататък никой друг вход на същия акаунт не тече едновременно с този.
    const u = await t.one<{ max_sessions: number }>(
      'SELECT max_sessions FROM users WHERE id = $1 FOR UPDATE',
      [opts.userId]
    );
    const limit = Math.max(1, u.max_sessions || 1);

    // 1) Същото устройство, което влиза отново: старата му сесия отпада.
    //    Това НЕ е „изхвърляне“ — просто човекът е влязъл пак от лаптопа си,
    //    например след като е изчистил бисквитките. Без този ред всяко
    //    повторно влизане би изяждало от лимита и би изхвърляло телефона.
    const sashto = deviceId
      ? await t.manyOrNone<{ id: string }>(
          `UPDATE user_sessions
              SET revoked_at = NOW(), revoked_reason = 'nov-vhod'
            WHERE user_id = $1 AND device_id = $2 AND revoked_at IS NULL
        RETURNING id`,
          [opts.userId, deviceId]
        )
      : [];

    // 2) Новата сесия.
    const nova = await t.one<{ id: string }>(
      `INSERT INTO user_sessions
         (user_id, device_id, device_label, user_agent, ip_address, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + ($6 || ' hours')::interval)
       RETURNING id`,
      [opts.userId, deviceId, label, orezhi(opts.userAgent, 500), orezhi(opts.ip, 64), String(chasove)]
    );

    // 3) Над лимита: пада най-старото по последна активност. „Най-старо по
    //    активност“, а не по създаване — иначе устройството, което човек
    //    ползва всеки ден, би падало заради едно влизане отпреди месец.
    const izhvarleni = await t.manyOrNone<{ id: string }>(
      `UPDATE user_sessions
          SET revoked_at = NOW(), revoked_reason = 'drugo-ustrojstvo'
        WHERE id IN (
          SELECT id FROM user_sessions
           WHERE user_id = $1 AND revoked_at IS NULL AND id <> $2
           ORDER BY last_seen_at DESC
          OFFSET $3
        )
      RETURNING id`,
      [opts.userId, nova.id, Math.max(0, limit - 1)]
    );

    return { sessionId: nova.id, izhvarleni: izhvarleni.map((r) => r.id), sashto: sashto.map((r) => r.id) };
  });

  zabravi([...rezultat.izhvarleni, ...rezultat.sashto]);
  return { sessionId: rezultat.sessionId, izhvarleni: rezultat.izhvarleni.length };
}

/**
 * Жива ли е сесията и на този ли потребител е.
 *
 * Проверката за собственика не е излишна: без нея открадната стойност на
 * `sid` от чужд токен би минала, ако подписът е валиден по друга причина.
 * Двете трябва да съвпадат.
 */
export async function sesiyataZhivaLi(
  sessionId: string,
  userId: string
): Promise<{ ok: true } | { ok: false; prichina: string }> {
  const sega = Date.now();
  const kesh = sesiiCache.get(sessionId);
  if (kesh && kesh.exp > sega) {
    if (!kesh.zhiva || kesh.userId !== userId) {
      return { ok: false, prichina: kesh.prichina || 'izteklo' };
    }
    dokosni(sessionId);
    return { ok: true };
  }

  const red = await db.oneOrNone<{
    user_id: string;
    revoked_reason: string | null;
    prekratena: boolean;
  }>(
    `SELECT user_id, revoked_reason,
            (revoked_at IS NOT NULL OR expires_at <= NOW()) AS prekratena
       FROM user_sessions
      WHERE id = $1`,
    [sessionId]
  );

  // Няма такъв ред: сесията е изчистена от историята или токенът е от
  // изтрит акаунт. И в двата случая — навън.
  const zhiva = !!red && !red.prekratena && red.user_id === userId;
  sesiiCache.set(sessionId, {
    userId: red?.user_id || '',
    zhiva,
    prichina: red?.revoked_reason || (red ? 'izteklo' : 'izteklo'),
    exp: sega + SESSION_CACHE_TTL_MS,
  });

  if (!zhiva) return { ok: false, prichina: red?.revoked_reason || 'izteklo' };
  dokosni(sessionId);
  return { ok: true };
}

/** Отбелязва, че устройството е било активно — но не по-често от TOUCH_INTERVAL_MS. */
function dokosni(sessionId: string): void {
  const sega = Date.now();
  const posleden = posledenZapis.get(sessionId) || 0;
  if (sega - posleden < TOUCH_INTERVAL_MS) return;
  posledenZapis.set(sessionId, sega);
  // Нарочно без await: заявката на потребителя не бива да чака запис,
  // който е само за сведение.
  db.none('UPDATE user_sessions SET last_seen_at = NOW() WHERE id = $1', [sessionId]).catch(() => {
    posledenZapis.delete(sessionId);
  });
}

/** Прекратява една сесия. Връща true, ако наистина е била жива. */
export async function prekrati(
  sessionId: string,
  prichina: PrichinaZaPrekratyavane,
  userId?: string
): Promise<boolean> {
  const r = await db.oneOrNone<{ id: string }>(
    `UPDATE user_sessions
        SET revoked_at = NOW(), revoked_reason = $2
      WHERE id = $1 AND revoked_at IS NULL
        AND ($3::uuid IS NULL OR user_id = $3)
    RETURNING id`,
    [sessionId, prichina, userId || null]
  );
  invalidateSession(sessionId);
  return !!r;
}

/** Прекратява всички сесии на акаунта, по избор без една (текущата). */
export async function prekratiVsichki(
  userId: string,
  prichina: PrichinaZaPrekratyavane,
  osven?: string
): Promise<number> {
  const redove = await db.manyOrNone<{ id: string }>(
    `UPDATE user_sessions
        SET revoked_at = NOW(), revoked_reason = $2
      WHERE user_id = $1 AND revoked_at IS NULL
        AND ($3::uuid IS NULL OR id <> $3)
    RETURNING id`,
    [userId, prichina, osven || null]
  );
  zabravi(redove.map((r) => r.id));
  return redove.length;
}

export type SesiyaZaSpisak = {
  id: string;
  device_label: string | null;
  ip_address: string | null;
  created_at: Date;
  last_seen_at: Date;
  tekushta: boolean;
};

/** Активните устройства на акаунта — за екрана „Моите устройства“. */
export async function aktivniSesii(userId: string, tekusht?: string): Promise<SesiyaZaSpisak[]> {
  const redove = await db.manyOrNone<Omit<SesiyaZaSpisak, 'tekushta'>>(
    `SELECT id, device_label, ip_address, created_at, last_seen_at
       FROM user_sessions
      WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
      ORDER BY last_seen_at DESC`,
    [userId]
  );
  return redove.map((r) => ({ ...r, tekushta: r.id === tekusht }));
}

/**
 * Колко различни устройства е видял акаунтът за последните N дни.
 *
 * Числото е за поглед, не за автоматично наказание. Двадесет устройства за
 * месец при акаунт с една сесия значи едно от двете: човекът е споделил
 * достъпа си, или някой му е взел паролата. И двете искат човешка проверка,
 * не автоматично заключване — затова тук се смята, а решението е горе.
 */
export async function brojUstrojstva(userId: string, dni = 30): Promise<number> {
  const r = await db.one<{ n: string }>(
    `SELECT COUNT(DISTINCT COALESCE(device_id, id::text)) AS n
       FROM user_sessions
      WHERE user_id = $1 AND created_at > NOW() - ($2 || ' days')::interval`,
    [userId, String(dni)]
  );
  return parseInt(r.n, 10) || 0;
}

/**
 * Акаунтите с необичайно много устройства — за админския панел.
 * Подредени по брой, за да е ясно откъде да се започне.
 */
export async function podozritelniAkaunti(prag = 6, dni = 30, limit = 50) {
  return db.manyOrNone<{
    user_id: string;
    email: string;
    name: string;
    ustrojstva: string;
    mrezhi: string;
    vhodove: string;
  }>(
    `SELECT s.user_id, u.email, u.name,
            COUNT(DISTINCT COALESCE(s.device_id, s.id::text)) AS ustrojstva,
            COUNT(DISTINCT s.ip_address)                      AS mrezhi,
            COUNT(*)                                          AS vhodove
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.created_at > NOW() - ($2 || ' days')::interval
      GROUP BY s.user_id, u.email, u.name
     HAVING COUNT(DISTINCT COALESCE(s.device_id, s.id::text)) >= $1
      ORDER BY ustrojstva DESC, mrezhi DESC
      LIMIT $3`,
    [prag, String(dni), limit]
  );
}

/**
 * Чисти историята. Пуска се периодично — иначе таблицата расте вечно, а
 * прекратените редове не служат за нищо след няколко месеца.
 */
export async function pochistiStariSesii(): Promise<number> {
  const r = await db.result(
    `DELETE FROM user_sessions
      WHERE revoked_at IS NOT NULL
        AND revoked_at < NOW() - ($1 || ' days')::interval`,
    [String(ISTORIYA_DNI)]
  );
  return r.rowCount || 0;
}
