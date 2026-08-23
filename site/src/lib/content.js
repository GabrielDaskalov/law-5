/**
 * УЧЕБНОТО СЪДЪРЖАНИЕ — идва от сървъра, а не от кода.
 *
 * ЗАЩО СЪЩЕСТВУВА ТОЗИ ФАЙЛ
 * Досега целият материал живееше в pravo-academy-data.js — 12,5 MB, които
 * всеки посетител сваляше преди да е влязъл и преди да е платил. Заключването
 * ставаше в браузъра, върху данни, които вече бяха у посетителя. Тоест
 * плащането не пазеше нищо.
 *
 * Сега:
 *   • сваля се само това, което текущият екран показва;
 *   • сървърът решава кой какво има право да види (една проверка, на едно
 *     място — `user_has_subject`), а браузърът само показва резултата;
 *   • верните отговори на тестовете изобщо не се пращат заедно с въпросите.
 *
 * КАК СЕ ПОЛЗВА
 * Екраните НЕ са пипани. Те продължават да викат `ContentStore.quiz(id)` и
 * получават масив веднага. Разликата е, че рутерът зарежда нужното ПРЕДИ да
 * извика екрана (`prepareRoute`), а тук стои кешът в паметта.
 */

/* ------------------------------------------------------- адрес и токен */

const API_BASE =
  localStorage.getItem('pa_api_url') ||
  (location.protocol.startsWith('http') ? '' : 'http://localhost:3000');

function jwt() {
  return localStorage.getItem('pa_jwt');
}

/** Всяка заявка минава оттук: токен, JSON, единни грешки. */
async function get(path, params) {
  const url = new URL(API_BASE + '/api/content' + path, location.origin);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }

  const headers = { Accept: 'application/json' };
  const token = jwt();
  if (token) headers.Authorization = 'Bearer ' + token;

  const res = await fetch(url.toString(), { headers });

  if (res.status === 403) {
    const err = new Error('Съдържанието изисква покупка');
    err.locked = true;
    throw err;
  }
  if (!res.ok) {
    let message = 'Грешка ' + res.status;
    try {
      const body = await res.json();
      message = body.message || message;
    } catch (e) { /* тялото не е JSON */ }
    throw new Error(message);
  }
  return res.json();
}

async function post(path, body) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const token = jwt();
  if (token) headers.Authorization = 'Bearer ' + token;

  const res = await fetch(API_BASE + '/api/content' + path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Грешка ' + res.status);
  return res.json();
}

/* -------------------------------------------------------------- кешът */

/**
 * Всичко свалено дотук, по предмет. Държи се в паметта за сесията —
 * при презареждане на страницата се тегли наново, за да не остарява.
 */
const cache = new Map();

function slot(code) {
  if (!cache.has(code)) {
    cache.set(code, {
      subject: null,     // каталожни данни + достъп
      topics: null,      // списък с теми (заглавия и заключване)
      chapters: null,    // конспект по теми; пълнят се при нужда
      flashcards: null,
      quiz: null,
      cases: null,
      access: { granted: false, freeTopics: 0, reason: 'anonymous' },
    });
  }
  return cache.get(code);
}

/** Изчиства кеша — след покупка, вход или изход правата се променят. */
export function resetContentCache() {
  cache.clear();
}

/* ------------------------------------------------- превод на формàта */

/**
 * Базата пази вида на блока в `type`, а екраните четат `t`.
 * Преводът е тук, за да не се пипат екраните.
 */
function toChapter(conspect, title) {
  if (!conspect) return { heading: title, sections: [], refs: [] };
  return {
    heading: conspect.heading || title,
    refs: conspect.refs || [],
    sections: (conspect.sections || []).map((sec) => ({
      title: sec.title,
      blocks: (sec.blocks || []).map((b) => ({
        t: b.type || b.t,
        text: b.text,
        items: b.items,
      })),
    })),
  };
}

/** Флашкартите се показват като { q, a }. */
function toCard(row) {
  return { q: row.question, a: row.answer, id: row.id, topicIdx: row._topicIdx };
}

/**
 * Въпросите идват БЕЗ верен отговор. Затова `correct` и `explain` тук са
 * празни — попълват се едва след проверка на сървъра.
 */
function toQuestion(row, topicIdx) {
  const base = {
    id: row.id,
    q: row.question,
    level: row.level,
    theme: row.theme,
    topicIdx,
    correct: null,
    explain: '',
  };
  if (row.kind === 'fill') {
    return { ...base, type: 'fill', direction: row.direction, accept: [], answer: '' };
  }
  return { ...base, options: row.options || [] };
}

function toCase(row, topicIdx) {
  return {
    id: row.id,
    num: row.number,
    title: row.title,
    theme: row.theme,
    level: row.level,
    concepts: row.concepts || [],
    goals: row.goals || [],
    facts: row.facts,
    questions: row.questions || [],
    hints: row.hints || [],
    // Примерният отговор се тегли отделно, чак когато студентът го поиска.
    solution: null,
    conclusion: null,
    mistakes: [],
    topicIdx,
  };
}

/* ----------------------------------------------------------- зареждане */

/** Каталог + теми. Това е най-малкото, което всеки екран на предмет иска. */
export async function loadSubject(code) {
  const s = slot(code);
  if (s.topics) return s;

  const detail = await get('/subjects/' + encodeURIComponent(code));
  s.subject = detail;
  s.access = detail.access || s.access;
  s.topics = detail.topics || [];
  s.chapters = s.topics.map((t) => ({
    heading: t.title,
    sections: null,          // null = още не е свален
    refs: [],
    locked: t.locked,
    topicId: t.id,
  }));
  return s;
}

/** Конспектът на една тема — тегли се само когато се отвори. */
export async function loadChapter(code, topicIdx) {
  const s = await loadSubject(code);
  const chapter = s.chapters[topicIdx];
  if (!chapter || chapter.sections) return s;

  try {
    const conspect = await get('/topics/' + chapter.topicId + '/conspect');
    const mapped = toChapter(conspect, chapter.heading);
    chapter.sections = mapped.sections;
    chapter.refs = mapped.refs;
    chapter.heading = mapped.heading;
    chapter.locked = false;
  } catch (err) {
    if (err.locked) {
      chapter.locked = true;
      chapter.sections = [];
    } else {
      chapter.sections = [];
      chapter.error = err.message;
    }
  }
  return s;
}

/** Помощно: индекс на тема по нейния идентификатор. */
function topicIndexer(s) {
  const byId = new Map(s.topics.map((t, i) => [t.id, i]));
  return (topicId) => (topicId && byId.has(topicId) ? byId.get(topicId) : 0);
}

export async function loadFlashcards(code) {
  const s = await loadSubject(code);
  if (s.flashcards) return s;
  const idx = topicIndexer(s);
  try {
    const rows = await get('/flashcards', { subject: code });
    s.flashcards = rows.map((r) => toCard({ ...r, _topicIdx: idx(r.topicId) }));
  } catch (err) {
    s.flashcards = [];
    s.flashcardsLocked = !!err.locked;
  }
  return s;
}

export async function loadQuiz(code) {
  const s = await loadSubject(code);
  if (s.quiz) return s;
  const idx = topicIndexer(s);
  try {
    const rows = await get('/quiz', { subject: code, limit: 100 });
    s.quiz = rows.map((r) => toQuestion(r, idx(r.topicId)));
  } catch (err) {
    s.quiz = [];
    s.quizLocked = !!err.locked;
  }
  return s;
}

export async function loadCases(code) {
  const s = await loadSubject(code);
  if (s.cases) return s;
  const idx = topicIndexer(s);
  try {
    const rows = await get('/cases', { subject: code });
    s.cases = rows.map((r) => toCase(r, idx(r.topicId)));
  } catch (err) {
    s.cases = [];
    s.casesLocked = !!err.locked;
  }
  return s;
}

/** Целият каталог — за началната страница и за пакетите. */
export async function loadCatalog() {
  if (cache.has('__catalog')) return cache.get('__catalog');
  const subjects = await get('/subjects');
  cache.set('__catalog', subjects);
  return subjects;
}

/* -------------------------------------------------------- четене (sync) */

export const cached = {
  chapters(code) {
    const s = cache.get(code);
    return s && s.chapters ? s.chapters : [];
  },
  flashcards(code) {
    const s = cache.get(code);
    return (s && s.flashcards) || [];
  },
  quiz(code) {
    const s = cache.get(code);
    return (s && s.quiz) || [];
  },
  cases(code) {
    const s = cache.get(code);
    return (s && s.cases) || [];
  },
  access(code) {
    const s = cache.get(code);
    return (s && s.access) || { granted: false, freeTopics: 0, reason: 'anonymous' };
  },
  catalog() {
    return cache.get('__catalog') || [];
  },
};

/* ------------------------------------------------- проверка на отговор */

/**
 * Тук е разликата от стария сайт: верният отговор не е бил в браузъра, за
 * да се сравни локално. Праща се даденият отговор и сървърът отсъжда.
 *
 * Резултатът се записва обратно във въпроса, за да работи обобщението в
 * края на теста, което чете `q.correct` и `q.explain`.
 */
export async function checkAnswer(question, given) {
  const result = await post('/quiz/' + question.id + '/check', given);

  question.correct = result.correctIndex;
  question.explain = result.explanation || '';
  question.optionExplanations = result.optionExplanations || null;
  question.methodNote = result.methodNote || null;
  if (result.correctAnswer) question.answer = result.correctAnswer;

  return result;
}

/** Примерното решение на казус — само при изрично поискване. */
export async function loadCaseSolution(kase) {
  if (kase.solution !== null && kase.solution !== undefined) return kase;
  const r = await get('/cases/' + kase.id + '/solution');
  kase.solution = r.solution;
  kase.conclusion = r.conclusion;
  kase.mistakes = r.mistakes || [];
  return kase;
}

/* ------------------------------------------------------------- търсене */

/**
 * Търсене в конспектите — на сървъра.
 *
 * Пълните текстове вече не са в браузъра, затова и търсенето в тях не може
 * да е там. Сървърът търси само в това, до което потребителят има достъп.
 *
 * Резултатът се връща във вида, който екранът за търсене вече очаква:
 * речник по предмет с „глави“, всяка със секции и блокове.
 */
export async function searchServer(query) {
  let hits;
  try {
    hits = await get('/search', { q: query });
  } catch (err) {
    return null;
  }

  const byCode = {};
  for (const hit of hits.conspects || []) {
    const code = hit.subjectCode;
    if (!byCode[code]) byCode[code] = [];
    // Индексът на темата се пази, за да води връзката към правилната глава.
    const chapters = cached.chapters(code);
    const idx = chapters.findIndex((c) => c.topicId === hit.topicId);
    const slot = idx >= 0 ? idx : byCode[code].length;
    byCode[code][slot] = {
      heading: hit.title,
      sections: [{ title: hit.title, blocks: [{ t: 'p', text: hit.snippet }] }],
      refs: [],
    };
  }
  // Дупките в масива объркват обхождането — запълват се с празни глави.
  for (const code of Object.keys(byCode)) {
    const arr = byCode[code];
    for (let i = 0; i < arr.length; i++) if (!arr[i]) arr[i] = { heading: '', sections: [], refs: [] };
  }
  return byCode;
}

/**
 * За екрана „Търсене“: сваля картите, тестовете и казусите на купените
 * предмети, за да работи търсенето из тях както преди.
 */
export async function loadOwnedForSearch() {
  const catalog = cached.catalog();
  const owned = catalog.filter((s) => s.access && s.access.granted);
  for (const s of owned) {
    await loadSubject(s.code);
    await Promise.all([
      loadFlashcards(s.code),
      loadQuiz(s.code),
      loadCases(s.code),
    ]);
  }
}

/**
 * Въпросите за конкретно избрани теми.
 *
 * ЗАЩО: списъкът на цял предмет е ограничен (сървърът връща най-много 100
 * въпроса наведнъж, за да не се тегли излишно). При 750 въпроса това значи,
 * че за по-задна тема в първите 100 може да няма нищо и тестът да излезе
 * празен. Затова, когато студентът избере теми, техните въпроси се теглят
 * поименно.
 */
export async function loadQuizForTopics(code, topicIdxs) {
  const s = await loadSubject(code);
  if (!s.quiz) s.quiz = [];
  if (!s.quizTopicsLoaded) s.quizTopicsLoaded = new Set();

  const idx = topicIndexer(s);
  const wanted = topicIdxs.filter((i) => !s.quizTopicsLoaded.has(i));
  if (!wanted.length) return s;

  const batches = await Promise.all(
    wanted.map(async (i) => {
      const chapter = s.chapters[i];
      if (!chapter || !chapter.topicId) return [];
      try {
        return await get('/quiz', { subject: code, topicId: chapter.topicId, limit: 100 });
      } catch (err) {
        return [];
      }
    }),
  );

  const known = new Set(s.quiz.map((q) => q.id));
  batches.flat().forEach((row) => {
    if (known.has(row.id)) return;
    known.add(row.id);
    s.quiz.push(toQuestion(row, idx(row.topicId)));
  });
  wanted.forEach((i) => s.quizTopicsLoaded.add(i));
  return s;
}

/**
 * Зареждане за админския панел.
 *
 * Разликата от студентския изглед е, че тук ТРЯБВА да се виждат верните
 * отговори — иначе няма какво да се редактира. Затова четенето е през
 * защитените админски маршрути, а не през публичните.
 */
export async function loadForAdmin(code) {
  const s = await loadSubject(code);
  if (s.adminLoaded) return s;

  const token = jwt();
  const headers = { Accept: 'application/json', Authorization: 'Bearer ' + token };
  const base = API_BASE + '/api/admin/content';
  const idx = topicIndexer(s);

  const fetchJson = async (path) => {
    const r = await fetch(base + path, { headers });
    if (!r.ok) throw new Error('Грешка ' + r.status);
    return r.json();
  };

  try {
    const [quiz, cases, cards] = await Promise.all([
      fetchJson('/quiz?subject=' + encodeURIComponent(code)),
      fetchJson('/cases?subject=' + encodeURIComponent(code)),
      fetchJson('/flashcards?subject=' + encodeURIComponent(code)),
    ]);

    s.quiz = quiz.map((r) => ({
      id: r.id,
      q: r.question,
      options: r.options || [],
      correct: r.correctIndex,
      explain: r.explanation || '',
      answer: r.answer || '',
      accept: r.accept || [],
      type: r.kind === 'fill' ? 'fill' : undefined,
      direction: r.direction,
      level: r.level,
      theme: r.theme,
      optionExplanations: r.optionExplanations,
      methodNote: r.methodNote,
      topicIdx: idx(r.topicId),
    }));

    s.cases = cases.map((r) => ({
      id: r.id,
      num: r.number,
      title: r.title,
      theme: r.theme,
      level: r.level,
      concepts: r.concepts || [],
      goals: r.goals || [],
      facts: r.facts,
      questions: r.questions || [],
      hints: r.hints || [],
      solution: r.solution,
      conclusion: r.conclusion,
      mistakes: r.mistakes || [],
      topicIdx: idx(r.topicId),
    }));

    s.flashcards = cards.map((r) => ({
      id: r.id,
      q: r.question,
      a: r.answer,
      topicIdx: idx(r.topicId),
      topic: r.topicLabel || '',
    }));

    s.adminLoaded = true;
  } catch (err) {
    // Панелът ще покаже празен списък; съобщението идва от самия екран.
  }
  return s;
}
