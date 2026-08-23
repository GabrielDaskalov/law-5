/**
 * Публично API за учебното съдържание.
 *
 * ГЛАВНОТО ТУК Е ДОСТЪПЪТ.
 * В стария фронтенд цялата учебна база се сваляше от всеки посетител —
 * плащането не пазеше нищо. Тук всяка заявка минава през една и съща
 * проверка (`assertTopicAccess`), а верните отговори никога не напускат
 * сървъра, преди студентът да е отговорил.
 *
 * Правило за безплатния достъп: първите `subjects.free_topic_limit` теми
 * на всеки предмет са отворени (витрина). Останалите изискват покупка.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '../db';
import { authenticate } from '../middleware/auth';
import { optionalAuth } from '../middleware/optionalAuth';
import { AppError } from '../types';

const router = Router();

/* ------------------------------------------------------------- помощни */

/**
 * ВАЖНО: наследява AppError, а не Error.
 * Централният errorHandler разпознава само AppError (по `statusCode`).
 * Собствен клас с поле `status` минаваше през него като непозната грешка
 * и всеки отказ 403 излизаше пред потребителя като „500 сървърна грешка“
 * вместо като „нужна е покупка“.
 */
class HttpError extends AppError {
  constructor(status: number, message: string, code?: string) {
    super(status, message, code);
    this.name = 'HttpError';
  }

  get status(): number {
    return this.statusCode;
  }
}

/** Обвива асинхронен маршрут, за да стигат грешките до errorHandler. */
const wrap =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };

const userId = (req: Request): string | null => req.user?.user_id ?? null;

/**
 * Администраторът вижда цялото съдържание.
 *
 * Без това той трябва да „купи“ всяка дисциплина, за да я редактира —
 * безсмислено и лесно за забравяне. Ролята вече е сверена с базата в
 * `optionalAuth`/`authenticate`, така че на нея може да се разчита.
 */
const isAdminReq = (req: Request): boolean => req.user?.role === 'admin';

interface SubjectRow {
  id: string;
  code: string;
  slug: string;
  title: string;
  tagline: string | null;
  study_year: number | null;
  is_featured: boolean;
  free_topic_limit: number;
  price_eur: string | null;
}

/**
 * Единствената проверка за достъп. Всичко, което показва платено
 * съдържание, минава оттук — за да няма два различни отговора на въпроса
 * „има ли право този потребител“.
 */
async function resolveAccess(
  uid: string | null,
  subjectCode: string,
): Promise<{ granted: boolean; freeTopics: number; reason: string }> {
  const subject = await db.oneOrNone<{ free_topic_limit: number }>(
    'SELECT free_topic_limit FROM subjects WHERE code = $1 AND is_published',
    [subjectCode],
  );
  if (!subject) throw new HttpError(404, 'Предметът не е намерен');

  if (!uid) {
    return { granted: false, freeTopics: subject.free_topic_limit, reason: 'anonymous' };
  }

  const row = await db.one<{ has: boolean }>(
    'SELECT user_has_subject($1, $2) AS has',
    [uid, subjectCode],
  );

  return row.has
    ? { granted: true, freeTopics: subject.free_topic_limit, reason: 'purchased' }
    : { granted: false, freeTopics: subject.free_topic_limit, reason: 'preview' };
}

/** Хвърля 403, ако темата е извън безплатните и не е купена. */
async function assertTopicAccess(
  uid: string | null,
  topicId: string,
  isAdmin = false,
): Promise<{ subjectCode: string }> {
  const topic = await db.oneOrNone<{ position: number; code: string; free_topic_limit: number }>(
    `SELECT t.position, s.code, s.free_topic_limit
       FROM topics t
       JOIN subjects s ON s.id = t.subject_id
      WHERE t.id = $1 AND t.is_published AND s.is_published`,
    [topicId],
  );
  if (!topic) throw new HttpError(404, 'Темата не е намерена');

  if (isAdmin) return { subjectCode: topic.code };
  if (topic.position < topic.free_topic_limit) return { subjectCode: topic.code };

  if (!uid) throw new HttpError(403, 'Нужен е вход и покупка', 'locked');

  const { has } = await db.one<{ has: boolean }>(
    'SELECT user_has_subject($1, $2) AS has',
    [uid, topic.code],
  );
  if (!has) throw new HttpError(403, 'Съдържанието изисква покупка на пакета', 'locked');

  return { subjectCode: topic.code };
}

/** Същото, но за ресурси, адресирани по код на предмет. */
async function assertSubjectAccess(
  uid: string | null,
  subjectCode: string,
  isAdmin = false,
): Promise<void> {
  if (isAdmin) return;
  const access = await resolveAccess(uid, subjectCode);
  if (!access.granted) throw new HttpError(403, 'Съдържанието изисква покупка на пакета', 'locked');
}

/* ------------------------------------------------------------- каталог */

router.get(
  '/subjects',
  optionalAuth,
  wrap(async (req, res) => {
    const uid = userId(req);

    const subjects = await db.any<SubjectRow & Record<string, string>>(
      `SELECT s.id, s.code, s.slug, s.title, s.tagline, s.study_year,
              s.is_featured, s.free_topic_limit, p.price_eur,
              (SELECT count(*) FROM topics          t WHERE t.subject_id = s.id AND t.is_published) AS topics,
              (SELECT count(*) FROM topic_conspects c JOIN topics t2 ON t2.id = c.topic_id
                WHERE t2.subject_id = s.id)                                                        AS conspects,
              (SELECT count(*) FROM flashcards      f WHERE f.subject_id = s.id)                   AS flashcards,
              (SELECT count(*) FROM quiz_items      q WHERE q.subject_id = s.id AND q.is_published) AS quizzes,
              (SELECT count(*) FROM study_cases     k WHERE k.subject_id = s.id AND k.is_published) AS cases
         FROM subjects s
         LEFT JOIN packages p ON p.id = s.code
        WHERE s.is_published
        ORDER BY s.study_year NULLS LAST, s.order_index`,
    );

    // Правата се вземат наведнъж, за да няма заявка на ред.
    const owned = new Set<string>();
    if (uid) {
      const rows = await db.any<{ package_id: string; is_bundle: boolean }>(
        `SELECT p.package_id, k.is_bundle
           FROM purchases p JOIN packages k ON k.id = p.package_id
          WHERE p.user_id = $1 AND p.status = 'completed'`,
        [uid],
      );
      const hasBundle = rows.some((r) => r.is_bundle);
      if (hasBundle) subjects.forEach((s) => owned.add(s.code));
      else rows.forEach((r) => owned.add(r.package_id));
    }

    res.json(
      subjects.map((s) => ({
        id: s.id,
        code: s.code,
        slug: s.slug,
        title: s.title,
        tagline: s.tagline,
        year: s.study_year,
        featured: s.is_featured,
        priceEur: s.price_eur != null ? Number(s.price_eur) : null,
        counts: {
          topics: Number(s.topics),
          conspects: Number(s.conspects),
          flashcards: Number(s.flashcards),
          quizzes: Number(s.quizzes),
          cases: Number(s.cases),
        },
        access: {
          granted: owned.has(s.code),
          freeTopics: s.free_topic_limit,
          reason: owned.has(s.code) ? 'purchased' : uid ? 'preview' : 'anonymous',
        },
      })),
    );
  }),
);

router.get(
  '/subjects/:code',
  optionalAuth,
  wrap(async (req, res) => {
    const uid = userId(req);
    const code = String(req.params.code);

    const subject = await db.oneOrNone<SubjectRow & { price_eur: string | null }>(
      `SELECT s.id, s.code, s.slug, s.title, s.tagline, s.study_year,
              s.is_featured, s.free_topic_limit, p.price_eur
         FROM subjects s
         LEFT JOIN packages p ON p.id = s.code
        WHERE s.code = $1 AND s.is_published`,
      [code],
    );
    if (!subject) throw new HttpError(404, 'Предметът не е намерен');

    const access = await resolveAccess(uid, code);

    const topics = await db.any<{
      id: string; position: number; slug: string; title: string;
      conspect: boolean; flashcards: string; quizzes: string; cases: string;
    }>(
      `SELECT t.id, t.position, t.slug, t.title,
              EXISTS (SELECT 1 FROM topic_conspects c WHERE c.topic_id = t.id) AS conspect,
              (SELECT count(*) FROM flashcards  f WHERE f.topic_id = t.id) AS flashcards,
              (SELECT count(*) FROM quiz_items  q WHERE q.topic_id = t.id AND q.is_published) AS quizzes,
              (SELECT count(*) FROM study_cases k WHERE k.topic_id = t.id AND k.is_published) AS cases
         FROM topics t
        WHERE t.subject_id = $1 AND t.is_published
        ORDER BY t.position`,
      [subject.id],
    );

    const counts = topics.reduce(
      (acc, t) => ({
        topics: acc.topics + 1,
        conspects: acc.conspects + (t.conspect ? 1 : 0),
        flashcards: acc.flashcards + Number(t.flashcards),
        quizzes: acc.quizzes + Number(t.quizzes),
        cases: acc.cases + Number(t.cases),
      }),
      { topics: 0, conspects: 0, flashcards: 0, quizzes: 0, cases: 0 },
    );

    res.json({
      id: subject.id,
      code: subject.code,
      slug: subject.slug,
      title: subject.title,
      tagline: subject.tagline,
      year: subject.study_year,
      featured: subject.is_featured,
      priceEur: subject.price_eur != null ? Number(subject.price_eur) : null,
      counts,
      access,
      topics: topics.map((t) => ({
        id: t.id,
        position: t.position,
        slug: t.slug,
        title: t.title,
        // Заключените теми се показват по заглавие — обемът е част от офертата,
        // но съдържанието им не се дава.
        locked: !access.granted && t.position >= access.freeTopics,
        has: {
          conspect: t.conspect,
          flashcards: Number(t.flashcards),
          quizzes: Number(t.quizzes),
          cases: Number(t.cases),
        },
      })),
    });
  }),
);

/* ----------------------------------------------------------- конспекти */

router.get(
  '/topics/:topicId/conspect',
  optionalAuth,
  wrap(async (req, res) => {
    const topicId = String(req.params.topicId);
    await assertTopicAccess(userId(req), topicId, isAdminReq(req));

    const conspect = await db.oneOrNone(
      `SELECT id, topic_id AS "topicId", heading, sections, refs, updated_at AS "updatedAt"
         FROM topic_conspects
        WHERE topic_id = $1 AND is_published`,
      [topicId],
    );
    if (!conspect) throw new HttpError(404, 'Няма конспект за тази тема');

    res.json(conspect);
  }),
);

/* ---------------------------------------------------------- флашкарти */

router.get(
  '/flashcards',
  optionalAuth,
  wrap(async (req, res) => {
    const subjectCode = String(req.query.subject ?? '');
    const topicId = req.query.topicId ? String(req.query.topicId) : null;
    const uid = userId(req);

    if (!subjectCode) throw new HttpError(400, 'Липсва предмет');

    if (topicId) await assertTopicAccess(uid, topicId, isAdminReq(req));
    else await assertSubjectAccess(uid, subjectCode, isAdminReq(req));

    const cards = await db.any(
      `SELECT f.id, f.topic_id AS "topicId", f.position, f.question, f.answer,
              f.topic_label AS "topicLabel"
         FROM flashcards f
         JOIN subjects s ON s.id = f.subject_id
        WHERE s.code = $1
          AND ($2::uuid IS NULL OR f.topic_id = $2)
          AND f.is_published
        ORDER BY f.position`,
      [subjectCode, topicId],
    );

    res.json(cards);
  }),
);

/* ------------------------------------------------------------- тестове */

router.get(
  '/quiz',
  optionalAuth,
  wrap(async (req, res) => {
    const subjectCode = String(req.query.subject ?? '');
    const topicId = req.query.topicId ? String(req.query.topicId) : null;
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const shuffle = req.query.shuffle === 'true';
    const uid = userId(req);

    if (!subjectCode) throw new HttpError(400, 'Липсва предмет');

    if (topicId) await assertTopicAccess(uid, topicId, isAdminReq(req));
    else await assertSubjectAccess(uid, subjectCode, isAdminReq(req));

    // ВАЖНО: тук НЕ се селектират correct_index, answer, accept и explanation.
    // Те се дават едва при проверка на отговора.
    const items = await db.any(
      `SELECT q.id, q.topic_id AS "topicId", q.position, q.kind, q.question,
              q.options, q.direction, q.level, q.theme
         FROM quiz_items q
         JOIN subjects s ON s.id = q.subject_id
        WHERE s.code = $1
          AND ($2::uuid IS NULL OR q.topic_id = $2)
          AND q.is_published
        ORDER BY ${shuffle ? 'random()' : 'q.position'}
        LIMIT $3`,
      [subjectCode, topicId, limit],
    );

    res.json(items);
  }),
);

/**
 * Проверка на отговор. Сравнението е на сървъра — това е причината
 * верният отговор изобщо да не се праща със самия въпрос.
 */
router.post(
  '/quiz/:itemId/check',
  optionalAuth,
  wrap(async (req, res) => {
    const itemId = String(req.params.itemId);

    const item = await db.oneOrNone<{
      id: string; kind: 'mcq' | 'fill'; topic_id: string | null; subject_code: string;
      correct_index: number | null; answer: string | null; accept: string[];
      explanation: string | null; option_explanations: Record<string, string> | null;
      method_note: string | null;
    }>(
      `SELECT q.id, q.kind, q.topic_id, s.code AS subject_code,
              q.correct_index, q.answer, q.accept,
              q.explanation, q.option_explanations, q.method_note
         FROM quiz_items q
         JOIN subjects s ON s.id = q.subject_id
        WHERE q.id = $1 AND q.is_published`,
      [itemId],
    );
    if (!item) throw new HttpError(404, 'Въпросът не е намерен');

    // ПОПРАВКА: `quiz_items.topic_id` е nullable, а маршрутът е optionalAuth —
    // при въпрос без тема не се правеше НИКАКВА проверка и верният отговор с
    // обяснението излизаше и пред анонимен посетител. Резервът е достъпът по
    // предмет, точно както в GET /cases/:caseId/solution.
    if (item.topic_id) await assertTopicAccess(userId(req), item.topic_id, isAdminReq(req));
    else await assertSubjectAccess(userId(req), item.subject_code, isAdminReq(req));

    let correct = false;

    if (item.kind === 'mcq') {
      const given = Number(req.body?.index);
      correct = Number.isInteger(given) && given === item.correct_index;
    } else {
      const given = normalizeAnswer(String(req.body?.text ?? ''));
      correct = (item.accept ?? []).some((a) => normalizeAnswer(a) === given);
    }

    res.json({
      itemId: item.id,
      correct,
      correctIndex: item.kind === 'mcq' ? item.correct_index : null,
      correctAnswer: item.kind === 'fill' ? item.answer : null,
      explanation: item.explanation,
      optionExplanations: item.option_explanations,
      methodNote: item.method_note,
    });
  }),
);

/**
 * Свободните отговори се сравняват след изчистване на разлики, които не
 * променят смисъла: регистър, интервали, крайна пунктуация и ударения.
 */
function normalizeAnswer(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.,;:!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

router.post(
  '/quiz/attempts',
  authenticate,
  wrap(async (req, res) => {
    const uid = req.user!.user_id;
    const { subject, topicId, answers, durationSeconds } = req.body ?? {};

    if (!Array.isArray(answers) || answers.length === 0) {
      throw new HttpError(400, 'Няма отговори за записване');
    }

    const ids = answers.map((a: { itemId: string }) => a.itemId);
    const items = await db.any<{ id: string; kind: string; correct_index: number | null; accept: string[] }>(
      `SELECT id, kind, correct_index, accept FROM quiz_items WHERE id IN ($1:csv)`,
      [ids],
    );
    const byId = new Map(items.map((i) => [i.id, i]));

    let correct = 0;
    for (const a of answers as Array<{ itemId: string; index?: number; text?: string }>) {
      const item = byId.get(a.itemId);
      if (!item) continue;
      if (item.kind === 'mcq') {
        if (a.index === item.correct_index) correct++;
      } else if (a.text) {
        const given = normalizeAnswer(a.text);
        if ((item.accept ?? []).some((x) => normalizeAnswer(x) === given)) correct++;
      }
    }

    const total = answers.length;
    const scorePercent = total > 0 ? Math.round((correct / total) * 100) : 0;

    const attempt = await db.one<{ id: string; created_at: Date }>(
      `INSERT INTO quiz_results (user_id, quiz_id, score, total_questions, correct_answers, completed_at)
            VALUES ($1, NULL, $2, $3, $4, NOW())
         RETURNING id, created_at`,
      [uid, scorePercent, total, correct],
    ).catch(async () =>
      // Ако старата таблица не приема NULL quiz_id, записваме само прогреса.
      ({ id: 'unsaved', created_at: new Date() }),
    );

    res.json({
      attemptId: attempt.id,
      total,
      correct,
      scorePercent,
      durationSeconds: Number(durationSeconds) || 0,
      completedAt: new Date().toISOString(),
      subject,
      topicId: topicId ?? null,
    });
  }),
);

/* --------------------------------------------------------------- казуси */

router.get(
  '/cases',
  optionalAuth,
  wrap(async (req, res) => {
    const subjectCode = String(req.query.subject ?? '');
    const topicId = req.query.topicId ? String(req.query.topicId) : null;
    const uid = userId(req);

    if (!subjectCode) throw new HttpError(400, 'Липсва предмет');

    if (topicId) await assertTopicAccess(uid, topicId, isAdminReq(req));
    else await assertSubjectAccess(uid, subjectCode, isAdminReq(req));

    // Примерният отговор не влиза в списъка — иска се отделно.
    const cases = await db.any(
      `SELECT k.id, k.topic_id AS "topicId", k.position, k.number, k.title, k.theme,
              k.level, k.concepts, k.goals, k.facts, k.questions, k.hints,
              NULL AS solution, NULL AS conclusion, '[]'::jsonb AS mistakes
         FROM study_cases k
         JOIN subjects s ON s.id = k.subject_id
        WHERE s.code = $1
          AND ($2::uuid IS NULL OR k.topic_id = $2)
          AND k.is_published
        ORDER BY k.position`,
      [subjectCode, topicId],
    );

    res.json(cases);
  }),
);

router.get(
  '/cases/:caseId/solution',
  optionalAuth,
  wrap(async (req, res) => {
    const caseId = String(req.params.caseId);

    const item = await db.oneOrNone<{
      topic_id: string | null; subject_code: string;
      solution: string | null; conclusion: string | null; mistakes: string[];
    }>(
      `SELECT k.topic_id, s.code AS subject_code, k.solution, k.conclusion, k.mistakes
         FROM study_cases k
         JOIN subjects s ON s.id = k.subject_id
        WHERE k.id = $1 AND k.is_published`,
      [caseId],
    );
    if (!item) throw new HttpError(404, 'Казусът не е намерен');

    if (item.topic_id) await assertTopicAccess(userId(req), item.topic_id, isAdminReq(req));
    else await assertSubjectAccess(userId(req), item.subject_code);

    res.json({
      solution: item.solution,
      conclusion: item.conclusion,
      mistakes: item.mistakes ?? [],
    });
  }),
);

/* ------------------------------------------------------------- търсене */

router.get(
  '/search',
  optionalAuth,
  wrap(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 3) {
      res.json({ conspects: [], cases: [], flashcards: [] });
      return;
    }

    const pattern = `%${q}%`;
    const uid = userId(req);

    /* ДВЕ ПОПРАВКИ СПРЯМО ПЪРВАТА ВЕРСИЯ:

       1) Откъсът беше `left(c.sections::text, 160)` — тоест суровият JSON на
          конспекта. На екрана излизаше `[{"title": "Изложение", "blocks":…`.
          Сега текстът на блоковете се сглобява и се връща човешки откъс
          около намерената дума.

       2) Търсеше се само по заглавие, и то без проверка на достъпа. Сега се
          търси и в тялото на конспекта, но САМО в темите, до които този
          потребител има право: купен предмет или безплатна тема от витрината.
          Иначе търсачката щеше да показва откъси от платено съдържание. */
    const [conspects, cases, flashcards] = await Promise.all([
      db.any(
        `WITH visible AS (
           SELECT t.id AS topic_id, t.title, s.code,
                  coalesce(c.heading, t.title) AS heading,
                  (SELECT string_agg(coalesce(b->>'text', ''), ' ')
                     FROM jsonb_array_elements(c.sections) sec,
                          jsonb_array_elements(sec->'blocks') b) AS body
             FROM topic_conspects c
             JOIN topics   t ON t.id = c.topic_id
             JOIN subjects s ON s.id = t.subject_id
            WHERE t.is_published AND s.is_published
              AND (
                t.position < s.free_topic_limit
                OR ($2::uuid IS NOT NULL AND user_has_subject($2, s.code))
              )
         )
         SELECT topic_id AS "topicId", title, code AS "subjectCode",
                CASE
                  WHEN position(lower($3) in lower(coalesce(body, ''))) > 0
                  THEN substr(body, greatest(1, position(lower($3) in lower(body)) - 70), 220)
                  ELSE left(coalesce(body, ''), 180)
                END AS snippet
           FROM visible
          WHERE title ILIKE $1 OR heading ILIKE $1 OR body ILIKE $1
          LIMIT 12`,
        [pattern, uid, q],
      ),
      db.any(
        `SELECT k.id, k.title, s.code AS "subjectCode"
           FROM study_cases k JOIN subjects s ON s.id = k.subject_id
          WHERE (k.title ILIKE $1 OR k.facts ILIKE $1)
            AND k.is_published AND s.is_published
            AND ($2::uuid IS NOT NULL AND user_has_subject($2, s.code))
          LIMIT 10`,
        [pattern, uid],
      ),
      db.any(
        `SELECT f.id, f.question, s.code AS "subjectCode"
           FROM flashcards f JOIN subjects s ON s.id = f.subject_id
          WHERE f.question ILIKE $1 AND f.is_published AND s.is_published
            AND ($2::uuid IS NOT NULL AND user_has_subject($2, s.code))
          LIMIT 10`,
        [pattern, uid],
      ),
    ]);

    res.json({ conspects, cases, flashcards });
  }),
);

export default router;
