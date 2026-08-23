#!/usr/bin/env ts-node
/**
 * Импортира учебното съдържание от content/data/**.json в PostgreSQL.
 *
 * Свойства:
 *   • идемпотентен — може да се пуска многократно; съпоставя по (subject.code)
 *     и (topic.subject_id, topic.position);
 *   • транзакционен по предмет — частичен импорт не оставя счупено състояние;
 *   • --dry-run показва какво би променил, без да пише;
 *   • --only <code[,code]> импортира само избрани предмети.
 *
 * Употреба:
 *   ts-node scripts/import-content.ts --data ../content/data
 *   ts-node scripts/import-content.ts --data ../content/data --only oblp,nk
 *   ts-node scripts/import-content.ts --data ../content/data --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { Pool, PoolClient } from 'pg';

/* --------------------------------------------------------------- аргументи */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const FLAG = (name: string) => process.argv.includes(`--${name}`);

const DATA_DIR = path.resolve(arg('data') ?? path.join(__dirname, '..', '..', 'content', 'data'));
const DRY_RUN = FLAG('dry-run');
const ONLY = (arg('only') ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/* ------------------------------------------------------------------- типове */

interface Topic { position: number; title: string; slug: string }
interface ConspectBlock { position: number; type: string; text?: string; items?: string[] }
interface ConspectSection { position: number; title: string | null; blocks: ConspectBlock[] }
interface Conspect { topic_index: number; heading: string | null; sections: ConspectSection[]; refs: string[] }
interface Flashcard {
  position: number; topic_index: number | null; topic_link: 'index' | 'label' | 'none';
  question: string; answer: string; topic_label: string | null; difficulty: string | null;
}
interface QuizItem {
  position: number; kind: 'mcq' | 'fill'; topic_index: number | null; question: string;
  options: string[]; correct_index: number | null;
  answer: string | null; accept: string[]; direction: string | null;
  explanation: string | null; level: string | null; theme: string | null;
  option_explanations: Record<string, string> | null; method_note: string | null;
}
interface StudyCase {
  position: number; topic_index: number | null; number: string | null; title: string;
  theme: string | null; level: string | null; concepts: string[]; goals: string[];
  facts: string; questions: string[]; hints: string[]; solution: string | null;
  conclusion: string | null; mistakes: string[];
}
interface SubjectFile {
  code: string; slug: string; title: string; tagline: string | null; year: number | null;
  featured: boolean; order_index: number; is_published: boolean;
  topics: Topic[]; conspects: Conspect[]; flashcards: Flashcard[];
  quizzes: QuizItem[]; cases: StudyCase[];
}

interface Stats {
  topics: number; conspects: number; flashcards: number; quizzes: number; cases: number;
}

/* ------------------------------------------------------------------ помощни */

const VALID_LEVELS = new Set(['базово', 'средно', 'високо']);
const level = (v: string | null) => (v && VALID_LEVELS.has(v) ? v : null);

/** Проверява входа преди да го пише — счупен ред спира само своя предмет. */
function validate(subject: SubjectFile): string[] {
  const errors: string[] = [];
  const topicCount = subject.topics.length;

  subject.quizzes.forEach((q, i) => {
    if (!q.question) errors.push(`quiz[${i}]: липсва въпрос`);

    if (q.kind === 'fill') {
      // упражнение със свободен отговор — проверява се срещу приети формулировки
      if (!q.answer) errors.push(`quiz[${i}]: липсва отговор (fill)`);
      if (!Array.isArray(q.accept) || q.accept.length < 1) {
        errors.push(`quiz[${i}]: няма нито една приета формулировка (fill)`);
      }
    } else {
      if (!Array.isArray(q.options) || q.options.length < 2) errors.push(`quiz[${i}]: под 2 опции`);
      else if (q.correct_index == null || q.correct_index < 0 || q.correct_index >= q.options.length) {
        errors.push(`quiz[${i}]: correct_index ${q.correct_index} извън обхвата`);
      }
    }

    if (q.topic_index != null && q.topic_index >= topicCount) {
      errors.push(`quiz[${i}]: topic_index ${q.topic_index} сочи несъществуваща тема`);
    }
  });

  subject.cases.forEach((c, i) => {
    if (!c.title) errors.push(`case[${i}]: липсва заглавие`);
    if (!c.facts) errors.push(`case[${i}]: липсват факти`);
  });

  subject.flashcards.forEach((f, i) => {
    if (!f.question || !f.answer) errors.push(`flashcard[${i}]: непълна карта`);
  });

  subject.conspects.forEach((c, i) => {
    if (c.topic_index >= topicCount) errors.push(`conspect[${i}]: сочи несъществуваща тема`);
  });

  return errors;
}

/* ------------------------------------------------------------------- импорт */

async function importSubject(client: PoolClient, subject: SubjectFile): Promise<Stats> {
  const stats: Stats = { topics: 0, conspects: 0, flashcards: 0, quizzes: 0, cases: 0 };

  // --- предмет -------------------------------------------------------------
  const { rows: [row] } = await client.query<{ id: string }>(
    `INSERT INTO subjects (code, slug, title, tagline, study_year, is_featured,
                           order_index, is_published, description)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $4)
     ON CONFLICT (code) WHERE code IS NOT NULL DO UPDATE
            SET slug = EXCLUDED.slug,
                title = EXCLUDED.title,
                tagline = EXCLUDED.tagline,
                study_year = EXCLUDED.study_year,
                is_featured = EXCLUDED.is_featured,
                order_index = EXCLUDED.order_index,
                is_published = EXCLUDED.is_published,
                updated_at = NOW()
      RETURNING id`,
    [subject.code, subject.slug, subject.title, subject.tagline, subject.year,
     subject.featured, subject.order_index, subject.is_published],
  );
  const subjectId = row.id;

  // --- теми ----------------------------------------------------------------
  const topicIdByPosition = new Map<number, string>();

  for (const t of subject.topics) {
    const { rows: [tr] } = await client.query<{ id: string }>(
      `INSERT INTO topics (subject_id, title, slug, position, order_index)
            VALUES ($1, $2, $3, $4, $4)
       ON CONFLICT (subject_id, position) WHERE position IS NOT NULL DO UPDATE
              SET title = EXCLUDED.title,
                  slug = EXCLUDED.slug,
                  order_index = EXCLUDED.order_index,
                  updated_at = NOW()
        RETURNING id`,
      [subjectId, t.title, t.slug, t.position],
    );
    topicIdByPosition.set(t.position, tr.id);
    stats.topics++;
  }

  const topicId = (idx: number | null | undefined): string | null =>
    (idx == null ? null : topicIdByPosition.get(idx) ?? null);

  // --- конспекти -----------------------------------------------------------
  for (const c of subject.conspects) {
    const tid = topicId(c.topic_index);
    if (!tid) continue;
    await client.query(
      `INSERT INTO topic_conspects (topic_id, heading, sections, refs)
            VALUES ($1, $2, $3::jsonb, $4::jsonb)
       ON CONFLICT (topic_id) DO UPDATE
              SET heading = EXCLUDED.heading,
                  sections = EXCLUDED.sections,
                  refs = EXCLUDED.refs,
                  updated_at = NOW()`,
      [tid, c.heading, JSON.stringify(c.sections), JSON.stringify(c.refs)],
    );
    stats.conspects++;
  }

  // --- останалите колекции се презаписват изцяло ---------------------------
  // Подредбата и броят им се управляват от файла-източник, затова изтриваме
  // и вмъкваме наново в същата транзакция. Ръчните промени от админ панела
  // се пазят в content_revisions.

  await client.query('DELETE FROM flashcards WHERE subject_id = $1', [subjectId]);
  for (const f of subject.flashcards) {
    await client.query(
      `INSERT INTO flashcards (subject_id, topic_id, question, answer, topic_label, position, difficulty)
            VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'medium'))`,
      [subjectId, topicId(f.topic_index), f.question, f.answer, f.topic_label, f.position, f.difficulty],
    );
    stats.flashcards++;
  }

  await client.query('DELETE FROM quiz_items WHERE subject_id = $1', [subjectId]);
  for (const q of subject.quizzes) {
    await client.query(
      `INSERT INTO quiz_items (subject_id, topic_id, position, kind, question,
                               options, correct_index, answer, accept, direction,
                               explanation, level, theme, option_explanations, method_note)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb, $10,
                    $11, $12, $13, $14::jsonb, $15)`,
      [subjectId, topicId(q.topic_index), q.position, q.kind ?? 'mcq', q.question,
       JSON.stringify(q.options ?? []), q.kind === 'fill' ? null : q.correct_index,
       q.kind === 'fill' ? q.answer : null, JSON.stringify(q.accept ?? []),
       q.direction, q.explanation, level(q.level), q.theme,
       q.option_explanations ? JSON.stringify(q.option_explanations) : null, q.method_note],
    );
    stats.quizzes++;
  }

  await client.query('DELETE FROM study_cases WHERE subject_id = $1', [subjectId]);
  for (const c of subject.cases) {
    await client.query(
      `INSERT INTO study_cases (subject_id, topic_id, position, number, title, theme, level,
                                concepts, goals, facts, questions, hints, solution, conclusion, mistakes)
            VALUES ($1, $2, $3, $4, $5, $6, $7,
                    $8::jsonb, $9::jsonb, $10, $11::jsonb, $12::jsonb, $13, $14, $15::jsonb)`,
      [subjectId, topicId(c.topic_index), c.position, c.number, c.title, c.theme, level(c.level),
       JSON.stringify(c.concepts), JSON.stringify(c.goals), c.facts,
       JSON.stringify(c.questions), JSON.stringify(c.hints), c.solution, c.conclusion,
       JSON.stringify(c.mistakes)],
    );
    stats.cases++;
  }

  // --- пакетът за продажба -------------------------------------------------
  // Кодът на предмета трябва да съществува като пакет, иначе достъпът
  // никога няма да се отключи след плащане.
  await client.query(
    `INSERT INTO packages (id, name, price_eur, is_bundle, is_active)
          VALUES ($1, $2, 35.00, FALSE, TRUE)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()`,
    [subject.code, subject.title],
  );

  return stats;
}

/* --------------------------------------------------------------------- main */

async function main() {
  const catalogPath = path.join(DATA_DIR, 'subjects.json');
  if (!fs.existsSync(catalogPath)) {
    console.error(`Липсва ${catalogPath}. Пуснете първо content/scripts/extract.mjs`);
    process.exit(1);
  }

  const catalog: Array<{ code: string; contentPending?: boolean }> =
    JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

  const codes = catalog
    .filter((c) => !c.contentPending)
    .map((c) => c.code)
    .filter((c) => ONLY.length === 0 || ONLY.includes(c));

  if (codes.length === 0) {
    console.error('Няма предмети за импорт.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    host: process.env.DATABASE_URL ? undefined : (process.env.DB_HOST ?? 'localhost'),
    port: process.env.DATABASE_URL ? undefined : Number(process.env.DB_PORT ?? 5432),
    user: process.env.DATABASE_URL ? undefined : process.env.DB_USER,
    password: process.env.DATABASE_URL ? undefined : process.env.DB_PASSWORD,
    database: process.env.DATABASE_URL ? undefined : (process.env.DB_NAME ?? 'pravo_academy'),
  });

  const totals: Stats = { topics: 0, conspects: 0, flashcards: 0, quizzes: 0, cases: 0 };
  let failed = 0;

  console.log(`\n  Импорт на ${codes.length} предмета${DRY_RUN ? ' (dry-run)' : ''}\n`);

  for (const code of codes) {
    const file = path.join(DATA_DIR, 'subjects', `${code}.json`);
    if (!fs.existsSync(file)) {
      console.error(`  ✗ ${code}: липсва ${path.basename(file)}`);
      failed++;
      continue;
    }

    const subject: SubjectFile = JSON.parse(fs.readFileSync(file, 'utf8'));
    const errors = validate(subject);
    if (errors.length) {
      console.error(`  ✗ ${code}: ${errors.length} невалидни записа`);
      errors.slice(0, 5).forEach((e) => console.error(`      ${e}`));
      failed++;
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const stats = await importSubject(client, subject);
      if (DRY_RUN) await client.query('ROLLBACK');
      else await client.query('COMMIT');

      for (const k of Object.keys(totals) as (keyof Stats)[]) totals[k] += stats[k];
      console.log(
        `  ✓ ${code.padEnd(6)} теми ${String(stats.topics).padStart(3)} · ` +
        `конспекти ${String(stats.conspects).padStart(3)} · ` +
        `карти ${String(stats.flashcards).padStart(4)} · ` +
        `тестове ${String(stats.quizzes).padStart(4)} · ` +
        `казуси ${String(stats.cases).padStart(3)}`,
      );
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  ✗ ${code}: ${(err as Error).message}`);
      failed++;
    } finally {
      client.release();
    }
  }

  console.log(
    `\n  Общо: ${totals.topics} теми, ${totals.conspects} конспекта, ` +
    `${totals.flashcards} карти, ${totals.quizzes} въпроса, ${totals.cases} казуса`,
  );
  if (DRY_RUN) console.log('  Dry-run — нищо не е записано.');
  if (failed) console.log(`  Пропуснати предмети: ${failed}`);
  console.log();

  await pool.end();
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
