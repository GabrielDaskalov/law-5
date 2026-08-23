#!/usr/bin/env node
/**
 * Извлича учебното съдържание от стария монолитен фронтенд (window.PA_DATA)
 * и го записва като нормализиран JSON, готов за импорт в PostgreSQL.
 *
 * Вход : legacy/pravo-academy-data.js  (12.5 MB вграден JS)
 *        legacy/index.html             (метаданни за предметите)
 * Изход: data/subjects.json            (каталог)
 *        data/subjects/<code>.json     (пълно съдържание по предмет)
 *        data/manifest.json            (контролни суми и статистики)
 *
 * Използване:  node scripts/extract.mjs [--legacy ../path/to/site]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const argLegacy = process.argv.indexOf('--legacy');
const LEGACY_DIR = argLegacy > -1
  ? path.resolve(process.argv[argLegacy + 1])
  : path.resolve(ROOT, 'legacy');

const OUT_DIR = path.join(ROOT, 'data');
const OUT_SUBJECTS = path.join(OUT_DIR, 'subjects');

/* ------------------------------------------------------------------ utils */

const slugMap = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's',
  т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sht',
  ъ: 'a', ь: 'y', ю: 'yu', я: 'ya',
};

/** Транслитерира кирилица и връща URL-безопасен slug. */
export function slugify(input, maxLen = 80) {
  const base = String(input || '')
    .toLowerCase()
    .split('')
    .map((ch) => slugMap[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen)
    .replace(/-+$/g, '');
  return base || 'item';
}

/** Прави slug-овете уникални в рамките на един предмет. */
function uniqueSlug(taken, candidate) {
  let slug = candidate;
  let n = 2;
  while (taken.has(slug)) slug = `${candidate}-${n++}`;
  taken.add(slug);
  return slug;
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

const clean = (v) => (typeof v === 'string' ? v.trim() : v);
const arr = (v) => (Array.isArray(v) ? v.filter((x) => x != null && x !== '') : []);

/* ------------------------------------------------------- четене на legacy */

function loadPaData() {
  const file = path.join(LEGACY_DIR, 'pravo-academy-data.js');
  if (!fs.existsSync(file)) {
    throw new Error(
      `Липсва ${file}\n` +
      `Подайте пътя до старата папка site/ с --legacy <път>`,
    );
  }
  const src = fs.readFileSync(file, 'utf8');
  // Файлът е обикновено присвояване към window.PA_DATA — изпълнява се в пясъчник
  // без достъп до Node globals.
  const sandbox = {};
  const fn = new Function('window', 'document', `${src}\n;return window.PA_DATA;`);
  const data = fn(sandbox, {});
  if (!data || !data.chapters) throw new Error('PA_DATA не е намерен или е с неочакван формат');
  return data;
}

/** Вади SUBJECTS = [...] от стария index.html без да изпълнява целия файл. */
function loadSubjectMeta() {
  const file = path.join(LEGACY_DIR, 'index.html');
  const fallback = {};
  if (!fs.existsSync(file)) return fallback;

  const html = fs.readFileSync(file, 'utf8');
  const start = html.indexOf('SUBJECTS = [');
  if (start < 0) return fallback;

  // Балансирано изрязване на масива
  const from = html.indexOf('[', start);
  let depth = 0;
  let end = -1;
  for (let i = from; i < html.length; i++) {
    const c = html[i];
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end < 0) return fallback;

  const literal = html.slice(from, end);
  let list;
  try {
    // Литералът реферира window.PA_DATA за chapters — подаваме празен обект,
    // защото chapters ги взимаме директно от PA_DATA.
    list = new Function('window', `return ${literal};`)({});
  } catch {
    return fallback;
  }

  const meta = {};
  for (const s of arr(list)) {
    if (!s || !s.id) continue;
    meta[s.id] = {
      title: clean(s.name) || s.id,
      year: Number.isFinite(s.year) ? s.year : null,
      tagline: clean(s.tagline) || null,
      featured: Boolean(s.featured),
    };
  }
  return meta;
}

/* ----------------------------------------------------- нормализация       */

/**
 * Конспектът в legacy формат е { heading, sections: [{ title, blocks: [...] }], refs }.
 * Пазим документната структура (JSONB в базата), но я валидираме и чистим.
 */
function normalizeConspect(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const sections = arr(raw.sections).map((sec, si) => ({
    position: si,
    title: clean(sec?.title) || null,
    blocks: arr(sec?.blocks).map((b, bi) => {
      const type = clean(b?.t) || 'p';
      const block = { position: bi, type };
      if (b?.text != null) block.text = clean(b.text);
      if (Array.isArray(b?.items)) block.items = arr(b.items).map(clean);
      // всяко друго поле го запазваме, за да не губим информация
      for (const [k, v] of Object.entries(b || {})) {
        if (!['t', 'text', 'items'].includes(k)) block[k] = v;
      }
      return block;
    }),
  })).filter((s) => s.blocks.length > 0 || s.title);

  return {
    heading: clean(raw.heading) || null,
    sections,
    refs: arr(raw.refs).map(clean),
  };
}

/**
 * Тестовите въпроси. Съществуват ДВА типа упражнения:
 *
 *   mcq  — въпрос с избор: { q, options[], correct, explain }
 *          Обогатеният формат от рецензираните партиди носи и ниво,
 *          обяснение за всяка грешна опция и методическа бележка.
 *
 *   fill — свободен отговор (латински): { type:'fill', direction, q,
 *          accept[], answer, explain }. Проверява се срещу списък от
 *          приети отговори, а не срещу индекс.
 *
 * Ако типът не се разпознае правилно, 982 упражнения по латински се
 * превръщат в празни въпроси — затова разграничението е изрично.
 */
function normalizeQuiz(raw, position) {
  const declaredType = clean(raw?.type);
  const options = arr(raw?.options).map(clean);
  const accept = arr(raw?.accept).map(clean);

  // Типът се извежда от данните, не се предполага.
  const kind = declaredType === 'fill' || (options.length === 0 && (accept.length > 0 || raw?.answer))
    ? 'fill'
    : 'mcq';

  const base = {
    position,
    kind,
    topic_index: Number.isInteger(raw?.topicIdx) ? raw.topicIdx : null,
    question: clean(raw?.q) || '',
    // в nk една карта носи обяснението под сгрешен ключ „explian“
    explanation: clean(raw?.explain) || clean(raw?.explian) || null,
    level: clean(raw?.level) || null,
    theme: clean(raw?.theme) || null,
    option_explanations: raw?.whyWrong && typeof raw.whyWrong === 'object' ? raw.whyWrong : null,
    method_note: clean(raw?.note) || null,
  };

  if (kind === 'fill') {
    const answer = clean(raw?.answer) || accept[0] || '';
    return {
      ...base,
      options: [],
      correct_index: null,
      answer,
      // приетите отговори включват и основния, без дубликати
      accept: [...new Set([answer, ...accept].filter(Boolean))],
      direction: clean(raw?.direction) || null,
    };
  }

  return {
    ...base,
    options,
    correct_index: Number.isInteger(raw?.correct) ? raw.correct : 0,
    answer: null,
    accept: [],
    direction: null,
  };
}

/**
 * Флашкартите в четири предмета нямат topicIdx, а само текстов етикет
 * „topic“. Етикетите съвпадат дословно със заглавията на темите, затова
 * връзката се възстановява по заглавие — иначе 134 карти остават без тема.
 */
function normalizeFlashcard(raw, position, topicIndexByTitle) {
  const label = clean(raw?.topic) || null;
  const byIdx = Number.isInteger(raw?.topicIdx) ? raw.topicIdx : null;
  const byLabel = label != null ? topicIndexByTitle.get(label) ?? null : null;

  return {
    position,
    topic_index: byIdx ?? byLabel,
    topic_link: byIdx != null ? 'index' : (byLabel != null ? 'label' : 'none'),
    question: clean(raw?.q) || '',
    answer: clean(raw?.a) || '',
    topic_label: label,
    difficulty: clean(raw?.difficulty) || null,
  };
}

/**
 * Казусите. Старата DB схема ги моделираше като съдебни решения
 * (legal_question / decision / court / year) — което не отговаря на
 * учебните казуси. Тук пазим действителната им структура.
 */
function normalizeCase(raw, position) {
  return {
    position,
    topic_index: Number.isInteger(raw?.topicIdx) ? raw.topicIdx : null,
    number: clean(raw?.num) ?? null,
    title: clean(raw?.title) || '',
    theme: clean(raw?.theme) || null,
    level: clean(raw?.level) || null,
    concepts: arr(raw?.concepts).map(clean),
    goals: arr(raw?.goals).map(clean),
    facts: clean(raw?.facts) || '',
    questions: arr(raw?.questions).map(clean),
    hints: arr(raw?.hints).map(clean),
    solution: clean(raw?.solution) || null,
    conclusion: clean(raw?.conclusion) || null,
    mistakes: arr(raw?.mistakes).map(clean),
  };
}

/* ----------------------------------------------------------------- главна */

function build() {
  const pa = loadPaData();
  const meta = loadSubjectMeta();

  fs.mkdirSync(OUT_SUBJECTS, { recursive: true });

  const codes = Object.keys(pa.chapters);
  const catalog = [];
  const manifest = { generatedFrom: 'pravo-academy-data.js', subjects: {} };

  let orderIndex = 0;

  for (const code of codes) {
    const chapters = arr(pa.chapters[code]).map(clean);
    const m = meta[code] || {};

    const takenSlugs = new Set();
    const topics = chapters.map((title, idx) => ({
      position: idx,
      title,
      slug: uniqueSlug(takenSlugs, slugify(title)),
    }));

    // конспекти: ключът е индексът на темата
    const conspectSrc = pa.conspectFull?.[code] || {};
    const conspects = [];
    for (const key of Object.keys(conspectSrc)) {
      const idx = Number(key);
      if (!Number.isInteger(idx)) continue;
      const doc = normalizeConspect(conspectSrc[key]);
      if (!doc) continue;
      conspects.push({ topic_index: idx, ...doc });
    }
    conspects.sort((a, b) => a.topic_index - b.topic_index);

    // индекс заглавие → позиция, за възстановяване на връзките по етикет
    const topicIndexByTitle = new Map(topics.map((t) => [t.title, t.position]));

    const flashcards = arr(pa.flashcards?.[code])
      .map((f, i) => normalizeFlashcard(f, i, topicIndexByTitle));
    const quizzes = arr(pa.quizzes?.[code]).map(normalizeQuiz);
    const cases = arr(pa.cases?.[code]).map(normalizeCase);

    const orphanCards = flashcards.filter((f) => f.topic_link === 'none').length;
    const fillCount = quizzes.filter((q) => q.kind === 'fill').length;

    const subject = {
      code,
      slug: slugify(m.title || code),
      title: m.title || code,
      tagline: m.tagline ?? null,
      year: m.year ?? null,
      featured: Boolean(m.featured),
      order_index: orderIndex++,
      is_published: true,
      counts: {
        topics: topics.length,
        conspects: conspects.length,
        flashcards: flashcards.length,
        quizzes: quizzes.length,
        cases: cases.length,
      },
      quality: {
        quizKinds: { mcq: quizzes.length - fillCount, fill: fillCount },
        flashcardsWithoutTopic: orphanCards,
      },
      topics,
      conspects,
      flashcards,
      quizzes,
      cases,
    };

    const json = JSON.stringify(subject, null, 2);
    fs.writeFileSync(path.join(OUT_SUBJECTS, `${code}.json`), json, 'utf8');

    catalog.push({
      code: subject.code,
      slug: subject.slug,
      title: subject.title,
      tagline: subject.tagline,
      year: subject.year,
      featured: subject.featured,
      order_index: subject.order_index,
      counts: subject.counts,
    });

    manifest.subjects[code] = {
      bytes: Buffer.byteLength(json, 'utf8'),
      sha256: sha256(json),
      ...subject.counts,
      ...subject.quality,
    };
  }

  // предмети от каталога без учебно съдържание (само витрина)
  for (const [code, m] of Object.entries(meta)) {
    if (catalog.some((c) => c.code === code)) continue;
    catalog.push({
      code,
      slug: slugify(m.title || code),
      title: m.title,
      tagline: m.tagline,
      year: m.year,
      featured: m.featured,
      order_index: orderIndex++,
      counts: { topics: 0, conspects: 0, flashcards: 0, quizzes: 0, cases: 0 },
      contentPending: true,
    });
  }

  catalog.sort((a, b) => (a.year ?? 99) - (b.year ?? 99) || a.title.localeCompare(b.title, 'bg'));

  fs.writeFileSync(path.join(OUT_DIR, 'subjects.json'), JSON.stringify(catalog, null, 2), 'utf8');

  const totals = catalog.reduce((acc, s) => {
    for (const k of Object.keys(s.counts)) acc[k] = (acc[k] || 0) + s.counts[k];
    return acc;
  }, {});
  manifest.totals = totals;
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  /* ---------------------------------------------------------- отчет */
  const pad = (s, n) => String(s).padEnd(n);
  console.log('\n  Извлечено съдържание\n');
  console.log(`  ${pad('предмет', 10)}${pad('теми', 7)}${pad('конспекти', 11)}${pad('карти', 8)}${pad('тестове', 9)}казуси`);
  console.log('  ' + '─'.repeat(56));
  for (const s of catalog) {
    if (s.contentPending) continue;
    const c = s.counts;
    console.log(`  ${pad(s.code, 10)}${pad(c.topics, 7)}${pad(c.conspects, 11)}${pad(c.flashcards, 8)}${pad(c.quizzes, 9)}${c.cases}`);
  }
  console.log('  ' + '─'.repeat(56));
  console.log(`  ${pad('ОБЩО', 10)}${pad(totals.topics, 7)}${pad(totals.conspects, 11)}${pad(totals.flashcards, 8)}${pad(totals.quizzes, 9)}${totals.cases}`);

  const fill = Object.values(manifest.subjects).reduce((n, s) => n + (s.quizKinds?.fill || 0), 0);
  const orphan = Object.values(manifest.subjects).reduce((n, s) => n + (s.flashcardsWithoutTopic || 0), 0);
  console.log(`\n  Упражнения със свободен отговор: ${fill}`);
  console.log(`  Карти без връзка към тема:       ${orphan}`);
  console.log(`\n  Записано в ${path.relative(process.cwd(), OUT_DIR)}\n`);
}

build();
