/**
 * Админско API за учебното съдържание.
 *
 * ЗАЩО СЪЩЕСТВУВА:
 * В стария сайт съдържанието живееше вътре в кода (pravoacademy.html).
 * За да се поправи една запетайка в един въпрос, трябваше програмист и
 * ново качване на 13 MB файл. Затова тук всяко нещо, което Николай пише —
 * конспект, тестов въпрос, казус, флашкарта — се създава, поправя и трие
 * през HTTP, без пипане на код.
 *
 * ТРИ ПРАВИЛА, КОИТО ТОЗИ ФАЙЛ ПАЗИ:
 *
 * 1) Достъпът е само за админ и се сверява с базата (`authenticate` вече
 *    прави това за токени, които твърдят admin), а `requireAdmin` отсича
 *    останалите. Публичните маршрути от content.ts никога не пишат.
 *
 * 2) Всичко се валидира ПРЕДИ да стигне до базата. Проверките на базата
 *    (quiz_items_mcq_shape и т.н.) са последна преграда, не първа — от тях
 *    излиза съобщение на латиница, което никой редактор не разбира.
 *
 * 3) Всяка промяна оставя следа в content_revisions заедно със старата
 *    стойност. Грешно изтрит казус се възстановява от журнала, а не от
 *    архив отпреди седмица.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '../db';
import { authenticate } from '../middleware/auth';
import { AppError } from '../types';
import { InputValidator } from '../utils/validation';

const router = Router();

/* ------------------------------------------------------------- помощни */

/**
 * ВАЖНО: наследява AppError, а не Error.
 * Централният errorHandler разпознава само AppError (по `statusCode`).
 * Собствен клас с поле `status` минаваше през него като непозната грешка
 * и всеки отказ 403/422 излизаше пред потребителя като „500 сървърна
 * грешка“ — тоест paywall-ът работеше, но се оплакваше грешно.
 */
class HttpError extends AppError {
  constructor(status: number, message: string, code?: string) {
    super(status, message, code);
    this.name = 'HttpError';
  }

  /** За четимост на мястото на хвърлянето. */
  get status(): number {
    return this.statusCode;
  }
}

const wrap =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };

/** Пропуска само админ. Ролята вече е сверена с базата в `authenticate`. */
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden', message: 'Нужни са администраторски права' });
    return;
  }
  next();
}

const actor = (req: Request): string | null => req.user?.user_id ?? null;

/* ---------------------------------------------------------- валидация */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEVELS = ['базово', 'средно', 'високо'];

/** Събира всички проблеми наведнъж, вместо да спира на първия. */
class Validator {
  private readonly errors: Record<string, string> = {};

  str(value: unknown, field: string, min: number, max: number): string | null {
    if (typeof value !== 'string' || value.trim().length === 0) {
      this.errors[field] = 'Полето е задължително';
      return null;
    }
    const text = value.trim();
    if (text.length < min) {
      this.errors[field] = `Твърде кратко (минимум ${min} знака)`;
      return null;
    }
    if (text.length > max) {
      this.errors[field] = `Твърде дълго (максимум ${max} знака)`;
      return null;
    }
    return text;
  }

  optStr(value: unknown, field: string, max: number): string | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string') {
      this.errors[field] = 'Очаква се текст';
      return null;
    }
    const text = value.trim();
    if (text.length > max) {
      this.errors[field] = `Твърде дълго (максимум ${max} знака)`;
      return null;
    }
    return text || null;
  }

  strArray(value: unknown, field: string, maxItems = 50, maxLen = 4000): string[] {
    if (value === null || value === undefined) return [];
    if (!Array.isArray(value)) {
      this.errors[field] = 'Очаква се списък';
      return [];
    }
    if (value.length > maxItems) {
      this.errors[field] = `Твърде много елементи (максимум ${maxItems})`;
      return [];
    }
    const out: string[] = [];
    for (const item of value) {
      if (typeof item !== 'string') {
        this.errors[field] = 'Всички елементи трябва да са текст';
        return [];
      }
      const text = item.trim();
      if (text.length > maxLen) {
        this.errors[field] = `Елемент над ${maxLen} знака`;
        return [];
      }
      if (text) out.push(text);
    }
    return out;
  }

  uuid(value: unknown, field: string): string | null {
    if (typeof value !== 'string' || !UUID_RE.test(value)) {
      this.errors[field] = 'Невалиден идентификатор';
      return null;
    }
    return value;
  }

  optUuid(value: unknown, field: string): string | null {
    if (value === null || value === undefined || value === '') return null;
    return this.uuid(value, field);
  }

  level(value: unknown, field: string): string | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string' || !LEVELS.includes(value)) {
      this.errors[field] = `Нивото трябва да е едно от: ${LEVELS.join(', ')}`;
      return null;
    }
    return value;
  }

  int(value: unknown, field: string, min: number, max: number): number | null {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(num) || num < min || num > max) {
      this.errors[field] = `Очаква се цяло число между ${min} и ${max}`;
      return null;
    }
    return num;
  }

  fail(field: string, message: string): void {
    this.errors[field] = message;
  }

  get ok(): boolean {
    return Object.keys(this.errors).length === 0;
  }

  /** Хвърля 422 със списък по полета — фронтендът ги показва до входовете. */
  assert(): void {
    if (this.ok) return;
    const err = new HttpError(422, 'Данните не са валидни', 'validation');
    (err as unknown as { errors: Record<string, string> }).errors = this.errors;
    throw err;
  }
}

/**
 * Обясненията по грешни опции се ПАЗЯТ по индекс: { "1": "…", "2": "…" }.
 *
 * Приемат се и букви („А“, „Б“, „В“, „Г“), защото рецензираните партиди
 * са написани с букви. Превръщат се в индекс още тук — иначе при бъдещо
 * разбъркване на опциите обяснението остава закачено за буквата и почва
 * да обяснява друг отговор.
 *
 * Кирилското „А“ и латинското „A“ изглеждат еднакво, но са различни знаци;
 * приемаме и двете, за да не зависи вносът от подредбата на клавиатурата.
 */
const LETTER_TO_INDEX: Record<string, number> = {
  А: 0, Б: 1, В: 2, Г: 3, Д: 4, Е: 5,
  A: 0, B: 1, C: 2, D: 3, E: 4, F: 5,
};

function validateOptionExplanations(
  value: unknown,
  optionCount: number,
  v: Validator,
): Record<string, string> | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    v.fail('optionExplanations', 'Очаква се обект с индекси или букви на опциите');
    return null;
  }
  const out: Record<string, string> = {};
  for (const [key, text] of Object.entries(value as Record<string, unknown>)) {
    const trimmed = key.trim().replace(/[).\s]+$/, '');
    const idx = /^\d+$/.test(trimmed)
      ? Number(trimmed)
      : (LETTER_TO_INDEX[trimmed.toLocaleUpperCase('bg')] ?? NaN);

    if (!Number.isInteger(idx) || idx < 0 || idx >= optionCount) {
      v.fail('optionExplanations', `Обяснение за несъществуваща опция „${key}“`);
      return null;
    }
    if (typeof text !== 'string') {
      v.fail('optionExplanations', 'Обясненията трябва да са текст');
      return null;
    }
    const clean = text.trim();
    if (clean) out[String(idx)] = clean;
  }
  return Object.keys(out).length ? out : null;
}

/** Секциите на конспекта са дърво; проверява се формата, не съдържанието. */
function validateSections(value: unknown, v: Validator): unknown[] {
  if (!Array.isArray(value)) {
    v.fail('sections', 'Очаква се списък от секции');
    return [];
  }
  if (value.length > 200) {
    v.fail('sections', 'Твърде много секции (максимум 200)');
    return [];
  }

  value.forEach((section, si) => {
    if (typeof section !== 'object' || section === null) {
      v.fail(`sections[${si}]`, 'Секцията трябва да е обект');
      return;
    }
    const blocks = (section as { blocks?: unknown }).blocks;
    if (!Array.isArray(blocks)) {
      v.fail(`sections[${si}].blocks`, 'Очаква се списък от блокове');
      return;
    }
    blocks.forEach((block, bi) => {
      const type = (block as { type?: unknown })?.type;
      if (type !== 'p' && type !== 'h' && type !== 'list') {
        v.fail(`sections[${si}].blocks[${bi}].type`, 'Допустими: p, h, list');
        return;
      }
      if (type === 'list') {
        if (!Array.isArray((block as { items?: unknown }).items)) {
          v.fail(`sections[${si}].blocks[${bi}].items`, 'Списъкът няма елементи');
        }
      } else if (typeof (block as { text?: unknown }).text !== 'string') {
        v.fail(`sections[${si}].blocks[${bi}].text`, 'Липсва текст');
      }
    });
  });

  return value;
}

/* ---------------------------------------------------------- журнал */

/**
 * Записва промяната. Съзнателно приема вече отворена транзакция (`t`), за
 * да не остане следа за промяна, която после е върната назад.
 */
async function logRevision(
  t: { none: (q: string, v?: unknown[]) => Promise<null> },
  entityType: string,
  entityId: string,
  action: 'create' | 'update' | 'delete',
  actorId: string | null,
  before: unknown,
  after: unknown,
): Promise<void> {
  await t.none(
    `INSERT INTO content_revisions (entity_type, entity_id, action, actor_id, before_data, after_data)
     VALUES ($1, $2, $3, $4, $5:json, $6:json)`,
    [entityType, entityId, action, actorId, before ?? null, after ?? null],
  );
}

/* ------------------------------------------------------- четене (пълно) */

/** Редовете от базата → формата, която фронтендът очаква (QuizItemFull). */
interface QuizRow {
  id: string;
  topic_id: string | null;
  position: number;
  kind: string;
  question: string;
  options: string[];
  correct_index: number | null;
  answer: string | null;
  accept: string[];
  direction: string | null;
  explanation: string | null;
  level: string | null;
  theme: string | null;
  option_explanations: Record<string, string> | null;
  method_note: string | null;
  is_published: boolean;
}

const toQuizFull = (r: QuizRow) => ({
  id: r.id,
  topicId: r.topic_id,
  position: r.position,
  kind: r.kind,
  question: r.question,
  options: r.options ?? [],
  correctIndex: r.correct_index,
  answer: r.answer,
  accept: r.accept ?? [],
  direction: r.direction,
  explanation: r.explanation,
  level: r.level,
  theme: r.theme,
  optionExplanations: r.option_explanations,
  methodNote: r.method_note,
  isPublished: r.is_published,
});

interface CaseRow {
  id: string;
  topic_id: string | null;
  position: number;
  number: string | null;
  title: string;
  theme: string | null;
  level: string | null;
  concepts: string[];
  goals: string[];
  facts: string;
  questions: string[];
  hints: string[];
  solution: string | null;
  conclusion: string | null;
  mistakes: string[];
  is_published: boolean;
}

const toCaseFull = (r: CaseRow) => ({
  id: r.id,
  topicId: r.topic_id,
  position: r.position,
  number: r.number,
  title: r.title,
  theme: r.theme,
  level: r.level,
  concepts: r.concepts ?? [],
  goals: r.goals ?? [],
  facts: r.facts,
  questions: r.questions ?? [],
  hints: r.hints ?? [],
  solution: r.solution,
  conclusion: r.conclusion,
  mistakes: r.mistakes ?? [],
  isPublished: r.is_published,
});

const QUIZ_COLUMNS = `id, topic_id, position, kind, question, options, correct_index, answer,
                      accept, direction, explanation, level, theme, option_explanations,
                      method_note, is_published`;

const CASE_COLUMNS = `id, topic_id, position, number, title, theme, level, concepts, goals,
                      facts, questions, hints, solution, conclusion, mistakes, is_published`;

/** Кодът на предмета → id. Отделно, за да е едно съобщението при липса. */
async function subjectIdByCode(code: string): Promise<string> {
  const row = await db.oneOrNone<{ id: string }>('SELECT id FROM subjects WHERE code = $1', [code]);
  if (!row) throw new HttpError(404, `Няма предмет с код „${code}“`);
  return row.id;
}

/** Темата трябва да е от същия предмет — иначе въпросът увисва между два. */
async function assertTopicBelongs(topicId: string | null, subjectId: string): Promise<void> {
  if (!topicId) return;
  const row = await db.oneOrNone<{ subject_id: string }>(
    'SELECT subject_id FROM topics WHERE id = $1',
    [topicId],
  );
  if (!row) throw new HttpError(404, 'Темата не е намерена');
  if (row.subject_id !== subjectId) {
    throw new HttpError(422, 'Темата не принадлежи на посочения предмет');
  }
}

/** Следваща свободна позиция, за да не се трупат всички на 0. */
async function nextPosition(table: 'quiz_items' | 'study_cases', subjectId: string): Promise<number> {
  const row = await db.one<{ next: string }>(
    `SELECT coalesce(max(position), -1) + 1 AS next FROM ${table} WHERE subject_id = $1`,
    [subjectId],
  );
  return Number(row.next);
}

/* ================================================================= ТЕСТОВЕ */

router.get(
  '/quiz',
  authenticate,
  requireAdmin,
  wrap(async (req, res) => {
    const code = String(req.query.subject ?? '');
    if (!code) throw new HttpError(400, 'Липсва предмет');
    const subjectId = await subjectIdByCode(code);
    const topicId = req.query.topicId ? String(req.query.topicId) : null;

    const rows = await db.any<QuizRow>(
      `SELECT ${QUIZ_COLUMNS} FROM quiz_items
        WHERE subject_id = $1 AND ($2::uuid IS NULL OR topic_id = $2)
        ORDER BY position`,
      [subjectId, topicId],
    );
    res.json(rows.map(toQuizFull));
  }),
);

router.get(
  '/quiz/:itemId',
  authenticate,
  requireAdmin,
  wrap(async (req, res) => {
    const row = await db.oneOrNone<QuizRow>(
      `SELECT ${QUIZ_COLUMNS} FROM quiz_items WHERE id = $1`,
      [String(req.params.itemId)],
    );
    if (!row) throw new HttpError(404, 'Въпросът не е намерен');
    res.json(toQuizFull(row));
  }),
);

/**
 * Разчита и проверява тялото на въпрос. `partial` е true при PATCH —
 * тогава липсващите полета се вземат от съществуващия запис, за да не
 * може частична редакция да строши формата (напр. смяна на опциите без
 * correct_index).
 */
function readQuizBody(body: Record<string, unknown>, existing: QuizRow | null) {
  const v = new Validator();

  const kindRaw = body.kind ?? existing?.kind ?? 'mcq';
  if (kindRaw !== 'mcq' && kindRaw !== 'fill') {
    v.fail('kind', 'Допустими: mcq, fill');
    v.assert();
  }
  const kind = kindRaw as 'mcq' | 'fill';

  const question =
    body.question !== undefined
      ? v.str(body.question, 'question', 5, 4000)
      : (existing?.question ?? null);
  if (question === null && body.question !== undefined) v.assert();

  const topicId =
    body.topicId !== undefined ? v.optUuid(body.topicId, 'topicId') : (existing?.topic_id ?? null);

  const level = body.level !== undefined ? v.level(body.level, 'level') : (existing?.level ?? null);
  const theme =
    body.theme !== undefined ? v.optStr(body.theme, 'theme', 200) : (existing?.theme ?? null);
  const explanation =
    body.explanation !== undefined
      ? v.optStr(body.explanation, 'explanation', 4000)
      : (existing?.explanation ?? null);
  const methodNote =
    body.methodNote !== undefined
      ? v.optStr(body.methodNote, 'methodNote', 4000)
      : (existing?.method_note ?? null);

  let options: string[] = [];
  let correctIndex: number | null = null;
  let answer: string | null = null;
  let accept: string[] = [];
  let optionExplanations: Record<string, string> | null = null;

  if (kind === 'mcq') {
    options =
      body.options !== undefined
        ? v.strArray(body.options, 'options', 8, 2000)
        : (existing?.options ?? []);

    if (options.length < 2) v.fail('options', 'Нужни са поне 2 опции');

    // Еднакви опции правят въпроса неверен независимо от отговора.
    const seen = new Set(options.map((o) => o.toLocaleLowerCase('bg')));
    if (seen.size !== options.length) v.fail('options', 'Има повтарящи се опции');

    // Ако опциите се сменят, но не се посочи нов верен отговор, старият
    // индекс щеше да сочи вече друг текст — въпросът тихо става грешен.
    // Затова смяната на опции задължително идва с correctIndex.
    if (body.options !== undefined && body.correctIndex === undefined && existing) {
      v.fail('correctIndex', 'При смяна на опциите посочете кой е верният отговор');
    }

    correctIndex =
      body.correctIndex !== undefined
        ? v.int(body.correctIndex, 'correctIndex', 0, Math.max(options.length - 1, 0))
        : (existing?.correct_index ?? null);
    if (correctIndex === null) v.fail('correctIndex', 'Липсва верен отговор');
    else if (correctIndex >= options.length) v.fail('correctIndex', 'Сочи несъществуваща опция');

    const rawExpl =
      body.optionExplanations !== undefined
        ? body.optionExplanations
        : (existing?.option_explanations ?? null);
    optionExplanations = validateOptionExplanations(rawExpl, options.length, v);
  } else {
    answer =
      body.answer !== undefined
        ? v.str(body.answer, 'answer', 1, 2000)
        : (existing?.answer ?? null);
    if (!answer) v.fail('answer', 'Липсва отговор');

    accept =
      body.accept !== undefined
        ? v.strArray(body.accept, 'accept', 30, 2000)
        : (existing?.accept ?? []);
    // Базата иска поне един приет вариант; самият отговор винаги се приема.
    if (answer && !accept.some((a) => a.toLocaleLowerCase('bg') === answer!.toLocaleLowerCase('bg'))) {
      accept = [answer, ...accept];
    }
    if (accept.length === 0) v.fail('accept', 'Нужен е поне един приет вариант');
  }

  v.assert();

  return {
    kind,
    question: question!,
    topicId,
    level,
    theme,
    explanation,
    methodNote,
    options,
    correctIndex,
    answer,
    accept,
    optionExplanations,
    direction: (body.direction as string | undefined) ?? existing?.direction ?? null,
  };
}

router.post(
  '/subjects/:code/quiz',
  authenticate,
  requireAdmin,
  wrap(async (req, res) => {
    const subjectId = await subjectIdByCode(String(req.params.code));
    const data = readQuizBody(req.body ?? {}, null);
    await assertTopicBelongs(data.topicId, subjectId);

    const position = await nextPosition('quiz_items', subjectId);

    const created = await db.tx(async (t) => {
      const row = await t.one<QuizRow>(
        `INSERT INTO quiz_items
           (subject_id, topic_id, position, kind, question, options, correct_index, answer,
            accept, direction, explanation, level, theme, option_explanations, method_note, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6:json, $7, $8, $9:json, $10, $11, $12, $13, $14:json, $15, $16)
         RETURNING ${QUIZ_COLUMNS}`,
        [
          subjectId, data.topicId, position, data.kind, data.question, data.options,
          data.correctIndex, data.answer, data.accept, data.direction, data.explanation,
          data.level, data.theme, data.optionExplanations, data.methodNote, actor(req),
        ],
      );
      await logRevision(t, 'quiz_item', row.id, 'create', actor(req), null, toQuizFull(row));
      return row;
    });

    res.status(201).json(toQuizFull(created));
  }),
);

router.patch(
  '/quiz/:itemId',
  authenticate,
  requireAdmin,
  wrap(async (req, res) => {
    const id = String(req.params.itemId);
    const existing = await db.oneOrNone<QuizRow & { subject_id: string }>(
      `SELECT ${QUIZ_COLUMNS}, subject_id FROM quiz_items WHERE id = $1`,
      [id],
    );
    if (!existing) throw new HttpError(404, 'Въпросът не е намерен');

    const data = readQuizBody(req.body ?? {}, existing);
    await assertTopicBelongs(data.topicId, existing.subject_id);

    const updated = await db.tx(async (t) => {
      const row = await t.one<QuizRow>(
        `UPDATE quiz_items SET
            topic_id = $2, kind = $3, question = $4, options = $5:json, correct_index = $6,
            answer = $7, accept = $8:json, direction = $9, explanation = $10, level = $11,
            theme = $12, option_explanations = $13:json, method_note = $14, updated_by = $15
          WHERE id = $1
          RETURNING ${QUIZ_COLUMNS}`,
        [
          id, data.topicId, data.kind, data.question, data.options, data.correctIndex,
          data.answer, data.accept, data.direction, data.explanation, data.level,
          data.theme, data.optionExplanations, data.methodNote, actor(req),
        ],
      );
      await logRevision(t, 'quiz_item', id, 'update', actor(req), toQuizFull(existing), toQuizFull(row));
      return row;
    });

    res.json(toQuizFull(updated));
  }),
);

router.delete(
  '/quiz/:itemId',
  authenticate,
  requireAdmin,
  wrap(async (req, res) => {
    const id = String(req.params.itemId);
    const existing = await db.oneOrNone<QuizRow>(
      `SELECT ${QUIZ_COLUMNS} FROM quiz_items WHERE id = $1`,
      [id],
    );
    if (!existing) throw new HttpError(404, 'Въпросът не е намерен');

    await db.tx(async (t) => {
      // Журналът пази целия запис ПРЕДИ триенето — това е възстановяването.
      await logRevision(t, 'quiz_item', id, 'delete', actor(req), toQuizFull(existing), null);
      await t.none('DELETE FROM quiz_items WHERE id = $1', [id]);
    });

    res.status(204).end();
  }),
);

/* ================================================================== КАЗУСИ */

router.get(
  '/cases',
  authenticate,
  requireAdmin,
  wrap(async (req, res) => {
    const code = String(req.query.subject ?? '');
    if (!code) throw new HttpError(400, 'Липсва предмет');
    const subjectId = await subjectIdByCode(code);
    const topicId = req.query.topicId ? String(req.query.topicId) : null;

    const rows = await db.any<CaseRow>(
      `SELECT ${CASE_COLUMNS} FROM study_cases
        WHERE subject_id = $1 AND ($2::uuid IS NULL OR topic_id = $2)
        ORDER BY position`,
      [subjectId, topicId],
    );
    res.json(rows.map(toCaseFull));
  }),
);

router.get(
  '/cases/:caseId',
  authenticate,
  requireAdmin,
  wrap(async (req, res) => {
    const row = await db.oneOrNone<CaseRow>(
      `SELECT ${CASE_COLUMNS} FROM study_cases WHERE id = $1`,
      [String(req.params.caseId)],
    );
    if (!row) throw new HttpError(404, 'Казусът не е намерен');
    res.json(toCaseFull(row));
  }),
);

function readCaseBody(body: Record<string, unknown>, existing: CaseRow | null) {
  const v = new Validator();
  const has = (k: string) => body[k] !== undefined;

  const title = has('title') ? v.str(body.title, 'title', 3, 500) : (existing?.title ?? null);
  if (!title) v.fail('title', 'Липсва заглавие');

  const facts = has('facts') ? v.str(body.facts, 'facts', 10, 20000) : (existing?.facts ?? null);
  if (!facts) v.fail('facts', 'Липсва фактическа обстановка');

  const questions = has('questions')
    ? v.strArray(body.questions, 'questions', 20, 2000)
    : (existing?.questions ?? []);
  if (questions.length === 0) v.fail('questions', 'Казусът трябва да има поне един въпрос');

  const data = {
    topicId: has('topicId') ? v.optUuid(body.topicId, 'topicId') : (existing?.topic_id ?? null),
    number: has('number') ? v.optStr(body.number, 'number', 20) : (existing?.number ?? null),
    title,
    theme: has('theme') ? v.optStr(body.theme, 'theme', 500) : (existing?.theme ?? null),
    level: has('level') ? v.level(body.level, 'level') : (existing?.level ?? null),
    concepts: has('concepts')
      ? v.strArray(body.concepts, 'concepts', 30, 500)
      : (existing?.concepts ?? []),
    goals: has('goals') ? v.strArray(body.goals, 'goals', 20, 1000) : (existing?.goals ?? []),
    facts,
    questions,
    hints: has('hints') ? v.strArray(body.hints, 'hints', 20, 2000) : (existing?.hints ?? []),
    solution: has('solution')
      ? v.optStr(body.solution, 'solution', 40000)
      : (existing?.solution ?? null),
    conclusion: has('conclusion')
      ? v.optStr(body.conclusion, 'conclusion', 4000)
      : (existing?.conclusion ?? null),
    mistakes: has('mistakes')
      ? v.strArray(body.mistakes, 'mistakes', 20, 2000)
      : (existing?.mistakes ?? []),
  };

  v.assert();
  return data;
}

router.post(
  '/subjects/:code/cases',
  authenticate,
  requireAdmin,
  wrap(async (req, res) => {
    const subjectId = await subjectIdByCode(String(req.params.code));
    const data = readCaseBody(req.body ?? {}, null);
    await assertTopicBelongs(data.topicId, subjectId);

    const position = await nextPosition('study_cases', subjectId);

    const created = await db.tx(async (t) => {
      const row = await t.one<CaseRow>(
        `INSERT INTO study_cases
           (subject_id, topic_id, position, number, title, theme, level, concepts, goals,
            facts, questions, hints, solution, conclusion, mistakes, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8:json, $9:json, $10, $11:json, $12:json,
                 $13, $14, $15:json, $16)
         RETURNING ${CASE_COLUMNS}`,
        [
          subjectId, data.topicId, position, data.number, data.title, data.theme, data.level,
          data.concepts, data.goals, data.facts, data.questions, data.hints, data.solution,
          data.conclusion, data.mistakes, actor(req),
        ],
      );
      await logRevision(t, 'study_case', row.id, 'create', actor(req), null, toCaseFull(row));
      return row;
    });

    res.status(201).json(toCaseFull(created));
  }),
);

router.patch(
  '/cases/:caseId',
  authenticate,
  requireAdmin,
  wrap(async (req, res) => {
    const id = String(req.params.caseId);
    const existing = await db.oneOrNone<CaseRow & { subject_id: string }>(
      `SELECT ${CASE_COLUMNS}, subject_id FROM study_cases WHERE id = $1`,
      [id],
    );
    if (!existing) throw new HttpError(404, 'Казусът не е намерен');

    const data = readCaseBody(req.body ?? {}, existing);
    await assertTopicBelongs(data.topicId, existing.subject_id);

    const updated = await db.tx(async (t) => {
      const row = await t.one<CaseRow>(
        `UPDATE study_cases SET
            topic_id = $2, number = $3, title = $4, theme = $5, level = $6, concepts = $7:json,
            goals = $8:json, facts = $9, questions = $10:json, hints = $11:json, solution = $12,
            conclusion = $13, mistakes = $14:json, updated_by = $15
          WHERE id = $1
          RETURNING ${CASE_COLUMNS}`,
        [
          id, data.topicId, data.number, data.title, data.theme, data.level, data.concepts,
          data.goals, data.facts, data.questions, data.hints, data.solution, data.conclusion,
          data.mistakes, actor(req),
        ],
      );
      await logRevision(t, 'study_case', id, 'update', actor(req), toCaseFull(existing), toCaseFull(row));
      return row;
    });

    res.json(toCaseFull(updated));
  }),
);

router.delete(
  '/cases/:caseId',
  authenticate,
  requireAdmin,
  wrap(async (req, res) => {
    const id = String(req.params.caseId);
    const existing = await db.oneOrNone<CaseRow>(
      `SELECT ${CASE_COLUMNS} FROM study_cases WHERE id = $1`,
      [id],
    );
    if (!existing) throw new HttpError(404, 'Казусът не е намерен');

    await db.tx(async (t) => {
      await logRevision(t, 'study_case', id, 'delete', actor(req), toCaseFull(existing), null);
      await t.none('DELETE FROM study_cases WHERE id = $1', [id]);
    });

    res.status(204).end();
  }),
);

/* =============================================================== КОНСПЕКТИ */

router.put(
  '/topics/:topicId/conspect',
  authenticate,
  requireAdmin,
  wrap(async (req, res) => {
    const topicId = String(req.params.topicId);
    const topic = await db.oneOrNone<{ id: string }>('SELECT id FROM topics WHERE id = $1', [topicId]);
    if (!topic) throw new HttpError(404, 'Темата не е намерена');

    const body = (req.body ?? {}) as Record<string, unknown>;
    const v = new Validator();
    const heading = v.optStr(body.heading, 'heading', 500);
    const refs = v.strArray(body.refs, 'refs', 100, 1000);
    const sections = validateSections(body.sections, v);
    v.assert();

    const before = await db.oneOrNone(
      'SELECT id, heading, sections, refs FROM topic_conspects WHERE topic_id = $1',
      [topicId],
    );

    const saved = await db.tx(async (t) => {
      const row = await t.one<{
        id: string; topic_id: string; heading: string | null;
        sections: unknown[]; refs: string[]; updated_at: string;
      }>(
        `INSERT INTO topic_conspects (topic_id, heading, sections, refs, updated_by)
         VALUES ($1, $2, $3:json, $4:json, $5)
         ON CONFLICT (topic_id) DO UPDATE
            SET heading = EXCLUDED.heading, sections = EXCLUDED.sections,
                refs = EXCLUDED.refs, updated_by = EXCLUDED.updated_by
         RETURNING id, topic_id, heading, sections, refs, updated_at`,
        [topicId, heading, sections, refs, actor(req)],
      );
      await logRevision(
        t, 'conspect', row.id, before ? 'update' : 'create', actor(req), before, row,
      );
      return row;
    });

    res.json({
      id: saved.id,
      topicId: saved.topic_id,
      heading: saved.heading,
      sections: saved.sections,
      refs: saved.refs,
      updatedAt: saved.updated_at,
    });
  }),
);

/* =============================================================== ФЛАШКАРТИ */

interface FlashRow {
  id: string;
  topic_id: string | null;
  position: number | null;
  question: string;
  answer: string;
  topic_label: string | null;
}

const toFlash = (r: FlashRow) => ({
  id: r.id,
  topicId: r.topic_id,
  position: r.position ?? 0,
  question: r.question,
  answer: r.answer,
  topicLabel: r.topic_label,
});

router.get(
  '/flashcards',
  authenticate,
  requireAdmin,
  wrap(async (req, res) => {
    const code = String(req.query.subject ?? '');
    if (!code) throw new HttpError(400, 'Липсва предмет');
    const subjectId = await subjectIdByCode(code);
    const topicId = req.query.topicId ? String(req.query.topicId) : null;

    const rows = await db.any<FlashRow>(
      `SELECT id, topic_id, position, question, answer, topic_label
         FROM flashcards
        WHERE subject_id = $1 AND ($2::uuid IS NULL OR topic_id = $2)
        ORDER BY position NULLS LAST`,
      [subjectId, topicId],
    );
    res.json(rows.map(toFlash));
  }),
);

router.post(
  '/subjects/:code/flashcards',
  authenticate,
  requireAdmin,
  wrap(async (req, res) => {
    const subjectId = await subjectIdByCode(String(req.params.code));
    const body = (req.body ?? {}) as Record<string, unknown>;

    const v = new Validator();
    const question = v.str(body.question, 'question', 2, 4000);
    const answer = v.str(body.answer, 'answer', 1, 8000);
    const topicId = v.optUuid(body.topicId, 'topicId');
    v.assert();

    await assertTopicBelongs(topicId, subjectId);

    const pos = await db.one<{ next: string }>(
      'SELECT coalesce(max(position), -1) + 1 AS next FROM flashcards WHERE subject_id = $1',
      [subjectId],
    );

    const created = await db.tx(async (t) => {
      const row = await t.one<FlashRow>(
        `INSERT INTO flashcards (subject_id, topic_id, position, question, answer, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, topic_id, position, question, answer, topic_label`,
        [subjectId, topicId, Number(pos.next), question, answer, actor(req)],
      );
      await logRevision(t, 'flashcard', row.id, 'create', actor(req), null, toFlash(row));
      return row;
    });

    res.status(201).json(toFlash(created));
  }),
);

router.patch(
  '/flashcards/:id',
  authenticate,
  requireAdmin,
  wrap(async (req, res) => {
    const id = String(req.params.id);
    const existing = await db.oneOrNone<FlashRow & { subject_id: string }>(
      'SELECT id, topic_id, position, question, answer, topic_label, subject_id FROM flashcards WHERE id = $1',
      [id],
    );
    if (!existing) throw new HttpError(404, 'Флашкартата не е намерена');

    const body = (req.body ?? {}) as Record<string, unknown>;
    const v = new Validator();
    const question =
      body.question !== undefined ? v.str(body.question, 'question', 2, 4000) : existing.question;
    const answer =
      body.answer !== undefined ? v.str(body.answer, 'answer', 1, 8000) : existing.answer;
    const topicId =
      body.topicId !== undefined ? v.optUuid(body.topicId, 'topicId') : existing.topic_id;
    v.assert();

    await assertTopicBelongs(topicId, existing.subject_id);

    const updated = await db.tx(async (t) => {
      const row = await t.one<FlashRow>(
        `UPDATE flashcards SET question = $2, answer = $3, topic_id = $4, updated_at = now()
          WHERE id = $1
          RETURNING id, topic_id, position, question, answer, topic_label`,
        [id, question, answer, topicId],
      );
      await logRevision(t, 'flashcard', id, 'update', actor(req), toFlash(existing), toFlash(row));
      return row;
    });

    res.json(toFlash(updated));
  }),
);

router.delete(
  '/flashcards/:id',
  authenticate,
  requireAdmin,
  wrap(async (req, res) => {
    const id = String(req.params.id);
    const existing = await db.oneOrNone<FlashRow>(
      'SELECT id, topic_id, position, question, answer, topic_label FROM flashcards WHERE id = $1',
      [id],
    );
    if (!existing) throw new HttpError(404, 'Флашкартата не е намерена');

    await db.tx(async (t) => {
      await logRevision(t, 'flashcard', id, 'delete', actor(req), toFlash(existing), null);
      await t.none('DELETE FROM flashcards WHERE id = $1', [id]);
    });

    res.status(204).end();
  }),
);

/* ============================================================ МАСОВ ВНОС */

/**
 * Внася наведнъж цяла партида въпроси и казуси — това е пътят, по който
 * подготвените теми влизат в платформата, без да се пише по един въпрос.
 *
 * Два режима, задавани с полето `mode`:
 *
 *   merge (по подразбиране) — ако въпросът вече е внасян, се обновява,
 *   вместо да се дублира. Затова повторното пускане на същия файл не
 *   създава втори комплект. Стари въпроси, които ги няма във файла, остават.
 *
 *   replace — за всяка тема, засегната от файла, старите въпроси и казуси
 *   се изтриват и остава само това, което е във файла. Използва се, когато
 *   цяла тема се подменя с нова редакция: иначе старото и новото се смесват.
 *   Изтритото се записва в журнала (content_revisions), така че нищо не
 *   изчезва безследно. При този режим всеки запис задължително сочи тема.
 *
 * `dryRun: true` показва какво ще влезе и какво ще бъде изтрито, без да пипа
 * базата — препоръчително преди всяка замяна.
 *
 * Ако ПОНЕ ЕДИН запис е невалиден, не се записва нищо — по-добре ясен
 * списък с грешки, отколкото половин внесена тема.
 */
router.post(
  '/subjects/:code/import',
  authenticate,
  requireAdmin,
  wrap(async (req, res) => {
    const code = String(req.params.code);
    const subjectId = await subjectIdByCode(code);
    const body = (req.body ?? {}) as {
      quiz?: unknown[];
      cases?: unknown[];
      dryRun?: boolean;
      mode?: string;
    };

    // 'merge'   — както досега: съвпадащото се обновява, новото се добавя.
    // 'replace' — за всяка засегната тема старото съдържание се маха и
    //             остава само това от файла. Точно това иска редакторът,
    //             когато подменя цяла тема, а не я допълва.
    const mode = body.mode === 'replace' ? 'replace' : 'merge';

    const quizIn = Array.isArray(body.quiz) ? body.quiz : [];
    const casesIn = Array.isArray(body.cases) ? body.cases : [];
    if (quizIn.length === 0 && casesIn.length === 0) {
      throw new HttpError(400, 'Няма нищо за внасяне');
    }
    if (quizIn.length + casesIn.length > 2000) {
      throw new HttpError(413, 'Партидата е твърде голяма (максимум 2000 записа)');
    }

    // Първо всичко се проверява; чак ако всичко мине — се пише.
    const errors: string[] = [];
    const quizReady: ReturnType<typeof readQuizBody>[] = [];
    const casesReady: ReturnType<typeof readCaseBody>[] = [];

    quizIn.forEach((raw, i) => {
      try {
        quizReady.push(readQuizBody(raw as Record<string, unknown>, null));
      } catch (err) {
        const fields = (err as { errors?: Record<string, string> }).errors ?? {};
        const detail = Object.entries(fields).map(([f, m]) => `${f}: ${m}`).join('; ');
        errors.push(`въпрос №${i + 1}: ${detail || (err as Error).message}`);
      }
    });

    casesIn.forEach((raw, i) => {
      try {
        casesReady.push(readCaseBody(raw as Record<string, unknown>, null));
      } catch (err) {
        const fields = (err as { errors?: Record<string, string> }).errors ?? {};
        const detail = Object.entries(fields).map(([f, m]) => `${f}: ${m}`).join('; ');
        errors.push(`казус №${i + 1}: ${detail || (err as Error).message}`);
      }
    });

    if (errors.length > 0) {
      res.status(422).json({ inserted: 0, updated: 0, skipped: quizIn.length + casesIn.length, errors });
      return;
    }

    // Темите се проверяват веднъж, а не на всеки ред.
    const topicIds = new Set(
      [...quizReady, ...casesReady].map((d) => d.topicId).filter((t): t is string => !!t),
    );
    for (const topicId of topicIds) await assertTopicBelongs(topicId, subjectId);

    // При замяна темата е задължителна: без нея не се знае какво точно да
    // се махне, а изтриване „на сляпо“ в рамките на целия предмет би било
    // опасно.
    if (mode === 'replace') {
      const orphans =
        quizReady.filter((d) => !d.topicId).length + casesReady.filter((d) => !d.topicId).length;
      if (orphans > 0) {
        res.status(422).json({
          inserted: 0,
          updated: 0,
          deleted: 0,
          skipped: quizIn.length + casesIn.length,
          errors: [
            `При режим „замяна“ всеки запис трябва да е вързан за тема. ` +
              `${orphans} записа са без topicId.`,
          ],
        });
        return;
      }
    }

    if (body.dryRun) {
      // При замяна се показва и какво ще изчезне — да не се трие изненадващо.
      let wouldDelete = 0;
      if (mode === 'replace' && topicIds.size > 0) {
        const ids = [...topicIds];
        const counts = await db.one<{ n: string }>(
          `SELECT (
             (SELECT count(*) FROM quiz_items   WHERE subject_id = $1 AND topic_id = ANY($2::uuid[]))
           + (SELECT count(*) FROM study_cases  WHERE subject_id = $1 AND topic_id = ANY($2::uuid[]))
           ) AS n`,
          [subjectId, ids],
        );
        wouldDelete = Number(counts.n);
      }
      res.json({
        inserted: 0,
        updated: 0,
        deleted: 0,
        skipped: 0,
        errors: [],
        mode,
        wouldImport: { quiz: quizReady.length, cases: casesReady.length },
        wouldDelete,
        topics: topicIds.size,
      });
      return;
    }

    const result = await db.tx(async (t) => {
      let inserted = 0;
      let updated = 0;
      let deleted = 0;

      // ЗАМЯНА: старото съдържание на засегнатите теми се маха първо, в
      // същата транзакция. Ако нещо по-нататък се счупи, нищо не е изтрито.
      if (mode === 'replace' && topicIds.size > 0) {
        const ids = [...topicIds];
        for (const table of ['quiz_items', 'study_cases'] as const) {
          const old = await t.any<{ id: string }>(
            `SELECT * FROM ${table} WHERE subject_id = $1 AND topic_id = ANY($2::uuid[])`,
            [subjectId, ids],
          );
          for (const row of old) {
            await logRevision(
              t,
              table === 'quiz_items' ? 'quiz' : 'case',
              row.id,
              'delete',
              actor(req),
              row,
              null,
            );
          }
          await t.none(`DELETE FROM ${table} WHERE subject_id = $1 AND topic_id = ANY($2::uuid[])`, [
            subjectId,
            ids,
          ]);
          deleted += old.length;
        }
      }

      let quizPos = await nextPosition('quiz_items', subjectId);
      for (const d of quizReady) {
        const existing =
          mode === 'replace'
            ? null
            : await t.oneOrNone<{ id: string }>(
                `SELECT id FROM quiz_items
                  WHERE subject_id = $1 AND topic_id IS NOT DISTINCT FROM $2 AND question = $3`,
                [subjectId, d.topicId, d.question],
              );

        if (existing) {
          await t.none(
            `UPDATE quiz_items SET
                kind = $2, options = $3:json, correct_index = $4, answer = $5, accept = $6:json,
                explanation = $7, level = $8, theme = $9, option_explanations = $10:json,
                method_note = $11, updated_by = $12
              WHERE id = $1`,
            [
              existing.id, d.kind, d.options, d.correctIndex, d.answer, d.accept, d.explanation,
              d.level, d.theme, d.optionExplanations, d.methodNote, actor(req),
            ],
          );
          updated += 1;
        } else {
          await t.none(
            `INSERT INTO quiz_items
               (subject_id, topic_id, position, kind, question, options, correct_index, answer,
                accept, explanation, level, theme, option_explanations, method_note, updated_by)
             VALUES ($1, $2, $3, $4, $5, $6:json, $7, $8, $9:json, $10, $11, $12, $13:json, $14, $15)`,
            [
              subjectId, d.topicId, quizPos++, d.kind, d.question, d.options, d.correctIndex,
              d.answer, d.accept, d.explanation, d.level, d.theme, d.optionExplanations,
              d.methodNote, actor(req),
            ],
          );
          inserted += 1;
        }
      }

      let casePos = await nextPosition('study_cases', subjectId);
      for (const d of casesReady) {
        const existing =
          mode === 'replace'
            ? null
            : await t.oneOrNone<{ id: string }>(
                `SELECT id FROM study_cases
                  WHERE subject_id = $1 AND topic_id IS NOT DISTINCT FROM $2 AND title = $3`,
                [subjectId, d.topicId, d.title],
              );

        if (existing) {
          await t.none(
            `UPDATE study_cases SET
                number = $2, theme = $3, level = $4, concepts = $5:json, goals = $6:json,
                facts = $7, questions = $8:json, hints = $9:json, solution = $10,
                conclusion = $11, mistakes = $12:json, updated_by = $13
              WHERE id = $1`,
            [
              existing.id, d.number, d.theme, d.level, d.concepts, d.goals, d.facts,
              d.questions, d.hints, d.solution, d.conclusion, d.mistakes, actor(req),
            ],
          );
          updated += 1;
        } else {
          await t.none(
            `INSERT INTO study_cases
               (subject_id, topic_id, position, number, title, theme, level, concepts, goals,
                facts, questions, hints, solution, conclusion, mistakes, updated_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8:json, $9:json, $10, $11:json, $12:json,
                     $13, $14, $15:json, $16)`,
            [
              subjectId, d.topicId, casePos++, d.number, d.title, d.theme, d.level, d.concepts,
              d.goals, d.facts, d.questions, d.hints, d.solution, d.conclusion, d.mistakes,
              actor(req),
            ],
          );
          inserted += 1;
        }
      }

      return { inserted, updated, deleted };
    });

    res.json({ ...result, skipped: 0, errors: [], mode, topics: topicIds.size });
  }),
);

/* ========================================================== ПУБЛИКУВАНЕ */

/** Скриване/показване без триене — за въпрос, който още се доизглажда. */
router.patch(
  '/publish/:entity/:id',
  authenticate,
  requireAdmin,
  wrap(async (req, res) => {
    const entity = String(req.params.entity);
    const tables: Record<string, string> = {
      quiz: 'quiz_items',
      cases: 'study_cases',
      topics: 'topics',
      conspects: 'topic_conspects',
      flashcards: 'flashcards',
    };
    const table = tables[entity];
    if (!table) throw new HttpError(404, 'Непознат тип съдържание');

    const publish = req.body?.isPublished;
    if (typeof publish !== 'boolean') throw new HttpError(422, 'isPublished трябва да е true/false');

    const row = await db.oneOrNone<{ id: string; is_published: boolean }>(
      `UPDATE ${table} SET is_published = $2 WHERE id = $1 RETURNING id, is_published`,
      [String(req.params.id), publish],
    );
    if (!row) throw new HttpError(404, 'Записът не е намерен');

    res.json({ id: row.id, isPublished: row.is_published });
  }),
);

/* ============================================================== ЖУРНАЛ */

/** Историята на промените по един запис — кой, кога, какво е било преди. */
router.get(
  '/revisions/:entityType/:entityId',
  authenticate,
  requireAdmin,
  wrap(async (req, res) => {
    // ПОПРАВКА: `entity_id` в content_revisions е uuid. Негоден идентификатор
    // стигаше суров до базата и тя връщаше „invalid input syntax for type
    // uuid“ — тоест 500 за грешка на клиента. Сверяваме формата предварително
    // и връщаме 400.
    InputValidator.validateUUID(String(req.params.entityId), 'entityId');

    const rows = await db.any<{
      id: string; action: string; created_at: string;
      actor_email: string | null; before_data: unknown; after_data: unknown;
    }>(
      `SELECT r.id, r.action, r.created_at, u.email AS actor_email, r.before_data, r.after_data
         FROM content_revisions r
         LEFT JOIN users u ON u.id = r.actor_id
        WHERE r.entity_type = $1 AND r.entity_id = $2
        ORDER BY r.created_at DESC
        LIMIT 50`,
      [String(req.params.entityType), String(req.params.entityId)],
    );

    res.json(
      rows.map((r) => ({
        id: String(r.id),
        action: r.action,
        createdAt: r.created_at,
        actorEmail: r.actor_email,
        before: r.before_data,
        after: r.after_data,
      })),
    );
  }),
);

export default router;
