#!/usr/bin/env node
/**
 * kachi-temi.mjs — качва подготвените теми (въпроси и казуси) в платформата.
 *
 * Чете файловете „Тема-NN-въпроси-и-казуси.md“ такива, каквито се предават
 * за преглед, превръща ги в записи и ги изпраща на административното API.
 *
 * По подразбиране работи в режим ЗАМЯНА: за всяка тема, която присъства във
 * файловете, старите въпроси и казуси се махат и остава само новото. Така не
 * се получава смесица от стара и нова редакция. Изтритото се пази в журнала
 * на промените, така че нищо не изчезва безследно.
 *
 * Употреба:
 *
 *   node kachi-temi.mjs --papka ./gotovi --predmet obl --probno
 *   node kachi-temi.mjs --papka ./gotovi --predmet obl
 *
 * Ключове:
 *   --papka <път>      папка с файловете (по подразбиране текущата)
 *   --predmet <код>    код на предмета в платформата (напр. obl)
 *   --api <адрес>      адрес на сървъра (по подразбиране http://localhost:3000)
 *   --probno           само показва какво ще стане, без да пише в базата
 *   --dobavi           режим „добавяне“ вместо замяна (старото се запазва)
 *   --temi 48,49       само посочените номера теми
 *
 * Вход за достъп: променлива на средата LAWPLUS_TOKEN (администраторски токен)
 * или --token <стойност>.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/* ------------------------------------------------------------ ключове */

function args(argv) {
  const out = { papka: '.', api: 'http://localhost:3000', predmet: null, token: null };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--probno') out.probno = true;
    else if (a === '--dobavi') out.dobavi = true;
    else if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
  }
  return out;
}

const opt = args(process.argv);
const token = opt.token || process.env.LAWPLUS_TOKEN;

/* ------------------------------------------------------ четене на текста */

const LEVELS = { базово: 'базово', средно: 'средно', високо: 'високо' };

/** „Средно“ → „средно“; всичко неразпознато си остава непокътнато, за да проличи. */
function nivo(s) {
  if (!s) return null;
  const k = s.trim().toLocaleLowerCase('bg').replace(/\.$/, '');
  return LEVELS[k] ?? k;
}

const OPCIIA_RE = /^\s*[*-]\s*([АБВГДЕ])\)\s*(.+)$/;
/** Ред от списък: „* нещо“, „- нещо“, „1. нещо“. */
const TOCHKA_RE = /^\s*(?:[*-]|\d+[.)])\s+\S/;

/** Абзаците на едно поле се слепват в един ред, но празният ред остава раздел. */
function tekst(lines) {
  return lines
    .filter((l) => !/^\s*-{3,}\s*$/.test(l)) // разделителната черта не е текст
    .join('\n')
    .split(/\n\s*\n/)
    .map((p) => p.split('\n').map((x) => x.trim()).join(' ').trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

/**
 * Разделя блок на полета по образеца **Име** съдържание.
 * Връща списък от двойки, защото едно име (напр. „Защо А е грешен“) се
 * среща по няколко пъти в различни въпроси.
 */
function poleta(block) {
  const out = [];
  let cur = null;
  for (const raw of block.split('\n')) {
    const m = raw.match(/^\*\*(.+?)\*\*\s*(.*)$/);
    if (m) {
      if (cur) out.push(cur);
      cur = { ime: m[1].trim(), redove: m[2].trim() ? [m[2].trim()] : [] };
    } else if (cur) {
      cur.redove.push(raw);
    }
  }
  if (cur) out.push(cur);
  // Опциите на въпроса стоят под полето „Въпрос“, но не са част от текста му.
  return out.map((f) => ({
    ime: f.ime,
    redove: f.redove,
    tekst: tekst(f.redove.filter((l) => !OPCIIA_RE.test(l))),
  }));
}

/**
 * Точките на списък като отделни низове. Работи по редовете, а не по
 * слепения текст — иначе целият списък става една точка. Продължение на
 * ред (без водеща точка) се долепя към предходната точка.
 */
function spisak(redove) {
  const out = [];
  for (const raw of redove) {
    const l = raw.trim();
    if (!l || /^-{3,}$/.test(l)) continue;
    if (TOCHKA_RE.test(raw)) {
      out.push(l.replace(/^(?:[*-]|\d+[.)])\s*/, '').trim());
    } else if (out.length) {
      out[out.length - 1] += ` ${l}`;
    } else {
      out.push(l); // въвеждащ ред без точка — пази се, за да не се губи текст
    }
  }
  return out.map((l) => l.replace(/\s*[;.]$/, '').trim()).filter(Boolean);
}

const BUKVI = ['А', 'Б', 'В', 'Г', 'Д', 'Е'];

/** Един въпрос от текста → запис за качване. */
function chetiVapros(block, kade) {
  const opcii = [];
  for (const line of block.split('\n')) {
    const m = line.match(OPCIIA_RE);
    if (m) opcii.push({ bukva: m[1], tekst: m[2].trim() });
  }
  if (opcii.length < 2) throw new Error(`${kade}: не намерих опции`);

  const f = poleta(block);
  const vzemi = (ime) => f.find((x) => x.ime === ime)?.tekst ?? null;

  const vapros = vzemi('Въпрос');
  if (!vapros) throw new Error(`${kade}: липсва текст на въпроса`);

  const veren = (vzemi('Верен отговор') || '').trim().charAt(0);
  const idx = opcii.findIndex((o) => o.bukva === veren);
  if (idx < 0) throw new Error(`${kade}: верният отговор „${veren}“ не сочи опция`);

  // Обясненията се пазят по номер на опция, не по буква — така не зависят
  // от това дали някой пише „А“ на кирилица или на латиница.
  const obiasneniia = {};
  opcii.forEach((o, i) => {
    if (i === idx) return;
    const t = vzemi(`Защо ${o.bukva} е грешен`) || vzemi(`Защо ${o.bukva} е грешна`);
    if (t) obiasneniia[String(i)] = t;
  });

  return {
    kind: 'mcq',
    question: vapros,
    theme: vzemi('Тема'),
    level: nivo(vzemi('Ниво') || vzemi('Ниво на трудност')),
    options: opcii.map((o) => o.tekst),
    correctIndex: idx,
    explanation: vzemi('Защо верният отговор е верен'),
    optionExplanations: obiasneniia,
    methodNote: vzemi('Методическа бележка'),
  };
}

/** Един казус от текста → запис за качване. */
function chetiKazus(block, kade, nomer) {
  const f = poleta(block);
  const vzemi = (ime) => f.find((x) => x.ime === ime)?.tekst ?? null;
  const vzemiSpisak = (ime) => spisak(f.find((x) => x.ime === ime)?.redove ?? []);

  const zaglavie = vzemi('Заглавие');
  if (!zaglavie) throw new Error(`${kade}: липсва заглавие`);
  const fakti = vzemi('Факти');
  if (!fakti) throw new Error(`${kade}: липсва фактическа обстановка`);

  // „Студентът да може:“ е въведение към целите, а не цел.
  const celi = vzemiSpisak('Учебни цели').filter((l) => !/^Студентът да може:?$/i.test(l));

  return {
    number: String(nomer),
    title: zaglavie,
    theme: vzemi('Тема'),
    level: nivo(vzemi('Ниво на трудност') || vzemi('Ниво')),
    concepts: vzemiSpisak('Ключови понятия'),
    goals: celi,
    facts: fakti,
    questions: vzemiSpisak('Въпроси'),
    hints: vzemiSpisak('Насоки за решаване'),
    solution: vzemi('Примерен отговор'),
    conclusion: vzemi('Кратък извод'),
    mistakes: vzemiSpisak('Често срещани грешки'),
  };
}

/** Целият файл на една тема. */
function chetiFail(path) {
  const text = readFileSync(path, 'utf8');
  const zaglavie = (text.match(/^#\s*Тема\s*№?\s*(\d+)\.?\s*(.*)$/m) || []).slice(1);
  if (!zaglavie.length) throw new Error(`${path}: не намерих заглавие „# Тема NN. …“`);
  const nomer = Number(zaglavie[0]);

  const quiz = [];
  const cases = [];

  for (const m of text.matchAll(/^##\s*Въпрос\s*(\d+)\s*$([\s\S]*?)(?=^#{1,6}\s|$(?![\s\S]))/gm)) {
    quiz.push(chetiVapros(m[2], `тема ${nomer}, въпрос ${m[1]}`));
  }
  for (const m of text.matchAll(/^##\s*Казус\s*(\d+)\s*$([\s\S]*?)(?=^#{1,6}\s|$(?![\s\S]))/gm)) {
    cases.push(chetiKazus(m[2], `тема ${nomer}, казус ${m[1]}`, m[1]));
  }

  return { nomer, zaglavie: zaglavie[1].trim(), quiz, cases };
}

/* --------------------------------------------------------------- мрежа */

async function povikay(path, options = {}) {
  const r = await fetch(`${opt.api}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const detail = Array.isArray(body.errors) ? `\n  · ${body.errors.join('\n  · ')}` : '';
    throw new Error(`${path} → ${r.status} ${body.message || body.error || ''}${detail}`);
  }
  return body;
}

/* --------------------------------------------------------------- главно */

async function main() {
  const razbor = process.argv.includes('--razbor');
  if (!razbor) {
    if (!opt.predmet) throw new Error('Задайте предмет: --predmet <код>');
    if (!token) throw new Error('Липсва администраторски токен (LAWPLUS_TOKEN или --token)');
  }

  const samo = opt.temi ? new Set(String(opt.temi).split(',').map((n) => Number(n.trim()))) : null;

  const faylove = readdirSync(opt.papka)
    .filter((f) => f.endsWith('.md') && /Тема[-\s]?\d+|^\d+\.md$/.test(f))
    .sort();

  const temi = [];
  for (const f of faylove) {
    const t = chetiFail(join(opt.papka, f));
    if (samo && !samo.has(t.nomer)) continue;
    temi.push({ ...t, fayl: f });
  }
  if (!temi.length) throw new Error('Не намерих файлове с теми в тази папка');

  // --razbor: само разчита текста и показва какво е разпознал. Полезно е,
  // за да се види, че нищо не е изпуснато, преди изобщо да се пипа базата.
  if (razbor) {
    let vaprosi = 0;
    let kazusi = 0;
    for (const t of temi) {
      vaprosi += t.quiz.length;
      kazusi += t.cases.length;
      const bezObiasnenie = t.quiz.filter(
        (q) => Object.keys(q.optionExplanations).length !== q.options.length - 1,
      ).length;
      const bezPole = t.cases.filter(
        (c) =>
          !c.theme || !c.level || !c.concepts.length || !c.goals.length ||
          !c.questions.length || !c.hints.length || !c.solution || !c.conclusion ||
          !c.mistakes.length,
      ).length;
      console.log(
        `тема ${t.nomer}: ${t.quiz.length} въпроса, ${t.cases.length} казуса` +
          (bezObiasnenie ? ` · ВНИМАНИЕ: ${bezObiasnenie} въпроса с непълни обяснения` : '') +
          (bezPole ? ` · ВНИМАНИЕ: ${bezPole} казуса с липсващо поле` : ''),
      );
    }
    console.log(`\nОбщо: ${temi.length} теми, ${vaprosi} въпроса, ${kazusi} казуса`);
    if (process.argv.includes('--json')) {
      console.log(JSON.stringify(temi, null, 2));
    }
    return;
  }

  // Темите се разпознават по ЗАГЛАВИЕ, а не по номер: номерацията във
  // файловете и в платформата не съвпада (в един предмет разликата е две
  // позиции). Заглавието е по-надеждният ориентир, а при замяна грешката
  // би струвала изтрито чуждо съдържание.
  const predmet = await povikay(`/api/content/subjects/${opt.predmet}`);
  const kluch = (s) =>
    String(s)
      .toLocaleLowerCase('bg')
      .replace(/[–—−]/g, ' ')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  const poZaglavie = new Map(predmet.topics.map((t) => [kluch(t.title), t]));
  const poPoziciia = new Map(predmet.topics.map((t) => [t.position + 1, t]));

  // --karta 57=55,58=56 — ръчно съответствие за случаите, в които заглавията
  // се разминават твърде много, за да бъдат съпоставени автоматично.
  const karta = new Map(
    String(opt.karta || '')
      .split(',')
      .filter(Boolean)
      .map((p) => p.split('=').map((n) => Number(n.trim())))
      .map(([a, b]) => [a, b]),
  );

  /** Намира темата в платформата; при съмнение спира, вместо да гадае. */
  function namerиTema(t) {
    const moe = kluch(t.zaglavie);

    const tochno = poZaglavie.get(moe);
    if (tochno) return { tema: tochno, kak: 'заглавие' };

    // Ръчно съответствие: --karta 57=55 (тема от файл = номер в платформата).
    if (karta.has(t.nomer)) {
      const tema = poPoziciia.get(karta.get(t.nomer));
      if (!tema) throw new Error(`В платформата няма тема №${karta.get(t.nomer)}`);
      return { tema, kak: `ръчно посочване (№${karta.get(t.nomer)})` };
    }

    // Едното заглавие се съдържа в другото: в учебния план една тема често
    // носи по-дълго име, отколкото в платформата. Приема се само ако е
    // единствено — иначе е гадаене.
    const sadarzhashti = predmet.topics.filter((x) => {
      const negovo = kluch(x.title);
      const dalgo = negovo.length >= 15 && moe.length >= 15;
      return dalgo && (moe.startsWith(negovo) || negovo.startsWith(moe));
    });
    if (sadarzhashti.length === 1) {
      return { tema: sadarzhashti[0], kak: 'заглавие с продължение' };
    }

    // Близко съвпадение по думи — само ако е убедително и единствено.
    const dumi = new Set(kluch(t.zaglavie).split(' ').filter((w) => w.length > 3));
    const ocenki = predmet.topics
      .map((x) => {
        const d = new Set(kluch(x.title).split(' ').filter((w) => w.length > 3));
        let obshti = 0;
        for (const w of dumi) if (d.has(w)) obshti += 1;
        return { x, dial: dumi.size ? obshti / dumi.size : 0 };
      })
      .sort((a, b) => b.dial - a.dial);

    if (ocenki[0] && ocenki[0].dial >= 0.8 && (!ocenki[1] || ocenki[1].dial < 0.6)) {
      return { tema: ocenki[0].x, kak: `близко заглавие (${Math.round(ocenki[0].dial * 100)}%)` };
    }

    const poNomer = poPoziciia.get(t.nomer);
    const blizki = ocenki.slice(0, 3).map((o) => `„${o.x.title}“ (${Math.round(o.dial * 100)}%)`);
    throw new Error(
      `Тема ${t.nomer} („${t.zaglavie}“) не съвпада с нито една тема в предмет ` +
        `${opt.predmet}.\n  Най-близки: ${blizki.join('; ')}` +
        (poNomer ? `\n  На позиция ${t.nomer} в платформата стои: „${poNomer.title}“` : '') +
        `\n  Спирам, за да не заместя чуждо съдържание.`,
    );
  }

  const quiz = [];
  const cases = [];
  const otchet = [];

  const vzeti = new Map();
  for (const t of temi) {
    const { tema, kak } = namerиTema(t);

    // Две теми от файловете да сочат една и съща тема в платформата би
    // означало едната да изтрие другата.
    if (vzeti.has(tema.id)) {
      throw new Error(
        `Теми ${vzeti.get(tema.id)} и ${t.nomer} сочат една и съща тема в платформата ` +
          `(„${tema.title}“). Спирам.`,
      );
    }
    vzeti.set(tema.id, t.nomer);

    for (const q of t.quiz) quiz.push({ ...q, topicId: tema.id });
    for (const c of t.cases) cases.push({ ...c, topicId: tema.id });
    otchet.push(
      `  тема ${t.nomer} → №${tema.position + 1} „${tema.title}“ · ` +
        `${t.quiz.length} въпроса, ${t.cases.length} казуса` +
        (kak === 'заглавие' ? '' : ` · съпоставено по ${kak}`),
    );
  }

  console.log(`Прочетени ${temi.length} теми от ${opt.papka}:`);
  console.log(otchet.join('\n'));
  console.log(`Общо: ${quiz.length} въпроса, ${cases.length} казуса`);
  console.log(`Режим: ${opt.dobavi ? 'ДОБАВЯНЕ (старото остава)' : 'ЗАМЯНА (старото се маха)'}`);

  const telo = {
    quiz,
    cases,
    mode: opt.dobavi ? 'merge' : 'replace',
    dryRun: !!opt.probno,
  };

  const rez = await povikay(`/api/admin/content/subjects/${opt.predmet}/import`, {
    method: 'POST',
    body: JSON.stringify(telo),
  });

  if (opt.probno) {
    console.log(
      `\nПРОБНО (нищо не е записано): ще влязат ${rez.wouldImport.quiz} въпроса и ` +
        `${rez.wouldImport.cases} казуса; ще бъдат изтрити ${rez.wouldDelete} стари записа ` +
        `в ${rez.topics} теми.`,
    );
  } else {
    console.log(
      `\nГотово: добавени ${rez.inserted}, обновени ${rez.updated}, изтрити ${rez.deleted ?? 0}.`,
    );
  }
}

main().catch((err) => {
  console.error(`\nГрешка: ${err.message}`);
  process.exit(1);
});
