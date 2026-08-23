/**
 * Сигнали и прогресивна реакция.
 *
 * ПРИНЦИПЪТ
 * Нищо тук не блокира достъп само по себе си. Всеки от засичащите механизми
 * може да сгреши: VPN, споделен мобилен оператор, човек, който подготвя изпит
 * и наистина отваря трийсет конспекта за час. Затова сигналите се СЪБИРАТ, а
 * реакцията идва от сбора им — стъпаловидно, като всяка стъпка оставя на
 * честния човек изход:
 *
 *   0 · чисто            — нищо
 *   1 · тихо             — вижда се само от администратор
 *   2 · съобщение        — потребителят научава, че има необичайни влизания
 *   3 · смени паролата   — иска се смяна, преди да продължи
 *   4 · човешко решение  — администраторът решава; програмата не отива по-нататък
 *
 * Стъпка 3 не е заключване: ключът е у самия човек. Ако паролата му е
 * тръгнала по ръцете, точно това е и правилното действие; ако е споделил
 * достъпа си, смяната изхвърля всички, с които го е споделил.
 *
 * ЗАЩО НЯМА АВТОМАТИЧНО ЗАКЛЮЧВАНЕ
 * Двадесет устройства за месец значи или споделен акаунт, или открадната
 * парола. Разликата се вижда само от човек, а автоматичното заключване
 * наказва еднакво жертвата и виновния.
 */
import { db } from '../db';

export type VidSignal =
  | 'mnogo-ustrojstva'
  | 'nepotvardeno-vlizane'
  | 'teglene-na-edro'
  | 'nevazmozhno-dvizhenie';

/** Прагове за сбора от последните 30 дни. Изнесени, за да се настройват на живо. */
const PRAG_TIHO = parseInt(process.env.RISK_PRAG_TIHO || '3', 10);
const PRAG_SABSHTENIE = parseInt(process.env.RISK_PRAG_SABSHTENIE || '6', 10);
const PRAG_PAROLA = parseInt(process.env.RISK_PRAG_PAROLA || '10', 10);

/** Изключвател за средите, в които това само пречи (тестове, локална разработка). */
const VKLYUCHENO = process.env.RISK_ENABLED !== 'false';

/**
 * Автоматичното искане за смяна на паролата (стъпка 3).
 *
 * По подразбиране е включено. Изключва се, ако се окаже, че нещо гърми твърде
 * често — тогава остава само съобщението, а решението пада на администратора.
 */
const AVTOMATICHNA_SMYANA = process.env.RISK_AUTO_PASSWORD !== 'false';

const OPISANIE: Record<VidSignal, string> = {
  'mnogo-ustrojstva': 'ново устройство над месечния лимит',
  'nepotvardeno-vlizane': 'вход от непотвърдено устройство',
  'teglene-na-edro': 'много различни материали за кратко време',
  'nevazmozhno-dvizhenie': 'две мрежи, между които не се стига навреме',
};

/**
 * Записва сигнал. Никога не хвърля: засичането е допълнение, а не условие
 * заявката на потребителя да мине.
 */
export async function zapishiSignal(
  userId: string | null | undefined,
  vid: VidSignal,
  tezhest: 1 | 2 | 3,
  podrobnosti: Record<string, unknown> = {},
  ip?: string
): Promise<void> {
  if (!VKLYUCHENO || !userId) return;
  try {
    await db.none(
      `INSERT INTO security_signals (user_id, vid, tezhest, podrobnosti, ip_address)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [userId, vid, tezhest, JSON.stringify(podrobnosti), ip || null]
    );
  } catch (e) {
    console.error('[signal] не се записа:', (e as Error).message);
  }
}

export type Stepenka = {
  stepen: 0 | 1 | 2 | 3;
  sbor: number;
  /** Изречението към потребителя. Празно на степен 0 и 1 — той не вижда нищо. */
  sabshtenie: string;
  vidove: string[];
};

/** На коя стъпка е акаунтът според сбора от последните 30 дни. */
export async function stepenkaNaAkaunt(userId: string, dni = 30): Promise<Stepenka> {
  if (!VKLYUCHENO) return { stepen: 0, sbor: 0, sabshtenie: '', vidove: [] };

  // `signali_ochisteni_do` е чертата, под която старото не се брои: смяната
  // на паролата урежда всичко отпреди нея. Без това човекът, който е направил
  // точно каквото е поискано от него, го иска пак при следващия вход — и така
  // до безкрай.
  const r = await db.oneOrNone<{ sbor: string; vidove: string[] }>(
    `SELECT COALESCE(SUM(s.tezhest), 0)::text AS sbor,
            COALESCE(ARRAY_AGG(DISTINCT s.vid), '{}') AS vidove
       FROM security_signals s
       JOIN users u ON u.id = s.user_id
      WHERE s.user_id = $1
        AND s.created_at > NOW() - ($2 || ' days')::interval
        AND s.created_at > COALESCE(u.signali_ochisteni_do, TIMESTAMP '-infinity')`,
    [userId, String(dni)]
  );

  const sbor = parseInt(r?.sbor || '0', 10);
  const vidove = (r?.vidove || []).map((v) => OPISANIE[v as VidSignal] || v);

  let stepen: 0 | 1 | 2 | 3 = 0;
  if (sbor >= PRAG_PAROLA) stepen = 3;
  else if (sbor >= PRAG_SABSHTENIE) stepen = 2;
  else if (sbor >= PRAG_TIHO) stepen = 1;

  let sabshtenie = '';
  if (stepen === 2) {
    sabshtenie =
      'Забелязахме влизания от необичайно много устройства в този акаунт. '
      + 'Ако не си бил ти, смени паролата си — това изхвърля всички други устройства.';
  } else if (stepen === 3) {
    sabshtenie =
      'В този акаунт има влизания, които не приличат на един човек. '
      + 'За да продължиш, смени паролата си — това изхвърля всички други устройства.';
  }

  return { stepen, sbor, sabshtenie, vidove };
}

/**
 * Прилага стъпката след вход: на 3 вдига флага „смени паролата“.
 *
 * Вика се СЛЕД успешен вход, не преди — иначе човек с наистина открадната
 * парола би бил заключен, без изобщо да може да влезе и да я смени.
 */
export async function prilozhiStepenka(userId: string): Promise<Stepenka> {
  const s = await stepenkaNaAkaunt(userId);
  if (s.stepen === 3 && AVTOMATICHNA_SMYANA) {
    await db.none('UPDATE users SET must_change_password = true WHERE id = $1', [userId]);
  }
  return s;
}

/** Сваля флага — за администратор, който е проверил и е решил, че всичко е наред. */
export async function otmeniIskaneZaParola(userId: string, ochistiSignali = false): Promise<void> {
  // Чертата се вдига винаги: иначе искането пада сега и се връща утре, което
  // прави бутона безполезен.
  await db.none(
    'UPDATE users SET must_change_password = false, signali_ochisteni_do = NOW() WHERE id = $1',
    [userId]
  );
  // Триенето е отделно решение: чертата спира броенето, но историята остава
  // видима. Трие се само когато администраторът изрично поиска.
  if (ochistiSignali) {
    await db.none('DELETE FROM security_signals WHERE user_id = $1', [userId]);
  }
}

/** Сигналите на един акаунт — за админския екран. */
export async function signaliNaAkaunt(userId: string, limit = 50) {
  return db.manyOrNone(
    `SELECT vid, tezhest, podrobnosti, ip_address, created_at
       FROM security_signals
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [userId, limit]
  );
}

/** Акаунтите с най-много натрупано — подредени, за да е ясно откъде се почва. */
export async function akauntiZaPregled(dni = 30, limit = 50) {
  return db.manyOrNone<{
    user_id: string;
    email: string;
    name: string;
    sbor: string;
    broj: string;
    vidove: string[];
    must_change_password: boolean;
    posleden: Date;
  }>(
    `SELECT s.user_id, u.email, u.name, u.must_change_password,
            SUM(s.tezhest)::text            AS sbor,
            COUNT(*)::text                  AS broj,
            ARRAY_AGG(DISTINCT s.vid)       AS vidove,
            MAX(s.created_at)               AS posleden
       FROM security_signals s
       JOIN users u ON u.id = s.user_id
      WHERE s.created_at > NOW() - ($1 || ' days')::interval
      GROUP BY s.user_id, u.email, u.name, u.must_change_password
      ORDER BY SUM(s.tezhest) DESC, MAX(s.created_at) DESC
      LIMIT $2`,
    [String(dni), limit]
  );
}

export const PRAGOVE = { PRAG_TIHO, PRAG_SABSHTENIE, PRAG_PAROLA };
export { OPISANIE };
