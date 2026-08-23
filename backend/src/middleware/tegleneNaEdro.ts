/**
 * Засичане на теглене на едро.
 *
 * ЩО Е ТО
 * Четирийсет конспекта за десет минути не е учене. Не е и непременно кражба —
 * може да е човек, който прехвърля материала преди изпит — но е точно
 * поведението на този, който сваля всичко, за да го препрати.
 *
 * ЗАЩО НЕ БЛОКИРА
 * Защото не може да отличи двете. Затова само отбелязва: пише сигнал и
 * оставя решението на човек. Блокирането би спряло и подготвящия се студент,
 * а той е клиентът.
 *
 * КАК БРОИ
 * Не всички заявки — само РАЗЛИЧНИТЕ материали. Човек, който чете една тема
 * и се връща в нея десет пъти, прави десет заявки за един материал; този,
 * който сваля, минава през четирийсет различни. Броенето по различни
 * материали отличава двете, а броенето по заявки — не.
 *
 * Всичко е в паметта: това е сигнал, не счетоводство. При рестарт се губи и
 * това е приемливо — важното е образецът, не точното число.
 */
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { zapishiSignal } from '../services/signalService';

const VKLYUCHENO = process.env.BULK_DETECT_ENABLED !== 'false';

/** Прозорец, в който се брои. */
const PROZOREC_MS = parseInt(process.env.BULK_WINDOW_MS || '600000', 10);      // 10 мин

/** Различни материали, над които вече не прилича на четене. */
const PRAG = parseInt(process.env.BULK_PRAG || '25', 10);

/** Втори праг: вече не прилича и на подготовка за изпит. */
const PRAG_SILEN = parseInt(process.env.BULK_PRAG_SILEN || '50', 10);

type Prozorec = { ot: number; kluchove: Set<string>; dokladvano: 0 | 1 | 2 };
const broene = new Map<string, Prozorec>();

/** Какво се брои за „един материал“. Списъците не се броят — те са един екран. */
function kluch(pat: string): string | null {
  let m = pat.match(/^\/api\/content\/topics\/([^/?]+)\/conspect/);
  if (m) return 'k:' + m[1];

  m = pat.match(/^\/api\/content\/cases\/([^/?]+)\/solution/);
  if (m) return 'r:' + m[1];

  // Тестовете и флашкартите се теглят на пакет по тема — затова се брои
  // темата, а не отделният въпрос.
  m = pat.match(/^\/api\/content\/(quiz|flashcards|cases)\b.*[?&]topic(?:Id)?=([^&]+)/);
  if (m) return m[1][0] + ':' + m[2];

  return null;
}

/** Чисти изтеклите прозорци, за да не расте картата безкрайно. */
function pochisti(sega: number): void {
  if (broene.size < 500) return;
  for (const [k, v] of broene) {
    if (sega - v.ot > PROZOREC_MS) broene.delete(k);
  }
}

/**
 * Кой прави заявката.
 *
 * Този слой стои ПРЕДИ маршрутите, тоест преди `authenticate` и
 * `optionalAuth` — `req.user` още не съществува. Затова токенът се чете тук.
 * Подписът се ПРОВЕРЯВА: иначе всеки би могъл да си сглоби токен с чужд или
 * измислен номер и да пише сигнали от чуждо име.
 */
function koj(req: Request): string | null {
  if (req.user?.user_id) return req.user.user_id;
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return null;
  try {
    const p = jwt.verify(h.substring(7), config.jwt.secret, { algorithms: ['HS256'] }) as
      { user_id?: string } | null;
    return p?.user_id || null;
  } catch {
    return null;
  }
}

export function tegleneNaEdro(req: Request, _res: Response, next: NextFunction): void {
  if (!VKLYUCHENO) return next();

  const id = koj(req);
  if (!id) return next();

  const k = kluch(req.originalUrl || req.path || '');
  if (!k) return next();

  const sega = Date.now();
  let p = broene.get(id);

  if (!p || sega - p.ot > PROZOREC_MS) {
    p = { ot: sega, kluchove: new Set(), dokladvano: 0 };
    broene.set(id, p);
    pochisti(sega);
  }

  p.kluchove.add(k);
  const n = p.kluchove.size;

  // По един сигнал на праг на прозорец. Иначе една сесия на теглене би
  // напълнила таблицата със стотици еднакви редове и би изкривила сбора,
  // по който се решава на коя стъпка е акаунтът.
  if (n >= PRAG_SILEN && p.dokladvano < 2) {
    p.dokladvano = 2;
    void zapishiSignal(id, 'teglene-na-edro', 3,
      { razlichni: n, minuti: Math.round((sega - p.ot) / 60000) }, req.ip);
  } else if (n >= PRAG && p.dokladvano < 1) {
    p.dokladvano = 1;
    void zapishiSignal(id, 'teglene-na-edro', 2,
      { razlichni: n, minuti: Math.round((sega - p.ot) / 60000) }, req.ip);
  }

  next();
}

/** За проверките: изчиства броенето, за да е чисто началото на теста. */
export function nulirajBroeneto(): void {
  broene.clear();
}
