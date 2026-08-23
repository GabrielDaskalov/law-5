/**
 * РЕДАКЦИЯ НА СЪДЪРЖАНИЕТО ОТ АДМИН ПАНЕЛА — записва на сървъра.
 *
 * ЗАЩО:
 * Досега „редакцията“ в админ панела записваше в localStorage на самия
 * браузър. Тоест поправката се виждаше само от този компютър, а студентите
 * продължаваха да учат старото. Истинската промяна изискваше програмист да
 * пипне кода и да качи наново 13 MB файл.
 *
 * Сега редакциите отиват в базата през защитените админски маршрути и се
 * виждат от всички веднага. Ако сървърът е недостъпен или потребителят не е
 * админ, поведението остава старото (локални промени) — за да не се губи
 * работа при временен проблем.
 *
 * Формите в панела не са пипани: тук стои преводът между вида на данните в
 * екрана ({q, a, options, correct}) и вида в API-то
 * ({question, answer, options, correctIndex}).
 */
import { cached } from './content.js';

const API_BASE =
  localStorage.getItem('pa_api_url') ||
  (location.protocol.startsWith('http') ? '' : 'http://localhost:3000');

function jwt() {
  return localStorage.getItem('pa_jwt');
}

/** Панелът пише на сървъра само ако наистина сме влезли като админ. */
export function canWriteToServer() {
  return !!jwt() && window.PA_ROLE === 'admin';
}

async function send(method, path, body) {
  const res = await fetch(API_BASE + '/api/admin/content' + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: 'Bearer ' + jwt(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 204) return null;

  let data = null;
  try { data = await res.json(); } catch (e) { /* празно тяло */ }

  if (!res.ok) {
    // Грешките по полета идват от валидацията на сървъра — показваме първата.
    const fields = data && data.errors;
    const detail = fields ? Object.values(fields)[0] : null;
    throw new Error(detail || (data && data.message) || 'Грешка ' + res.status);
  }
  return data;
}

/** Индексът на темата в екрана → идентификаторът ѝ в базата. */
function topicIdFor(subjId, topicIdx) {
  const chapters = cached.chapters(subjId);
  const ch = chapters[Number(topicIdx) || 0];
  return ch ? ch.topicId : null;
}

/* ------------------------------------------------------------- превод */

function toQuizPayload(subjId, item) {
  const isFill = item.type === 'fill' || (!item.options && item.answer);
  const base = {
    topicId: topicIdFor(subjId, item.topicIdx),
    question: item.q ?? item.question ?? '',
    explanation: item.explain ?? item.explanation ?? null,
    level: item.level ?? null,
  };
  if (isFill) {
    return {
      ...base,
      kind: 'fill',
      answer: item.answer ?? '',
      accept: item.accept && item.accept.length ? item.accept : [item.answer ?? ''],
    };
  }
  return {
    ...base,
    kind: 'mcq',
    options: item.options || [],
    correctIndex: typeof item.correct === 'number' ? item.correct : item.correctIndex,
    optionExplanations: item.optionExplanations ?? null,
    methodNote: item.methodNote ?? null,
  };
}

function toCasePayload(subjId, item) {
  return {
    topicId: topicIdFor(subjId, item.topicIdx),
    number: item.num != null ? String(item.num) : null,
    title: item.title || '',
    theme: item.theme ?? null,
    level: item.level ?? null,
    concepts: item.concepts || [],
    goals: item.goals || [],
    facts: item.facts || '',
    questions: item.questions || [],
    hints: item.hints || [],
    solution: item.solution ?? null,
    conclusion: item.conclusion ?? null,
    mistakes: item.mistakes || [],
  };
}

function toFlashPayload(subjId, item) {
  return {
    topicId: topicIdFor(subjId, item.topicIdx),
    question: item.q ?? item.question ?? '',
    answer: item.a ?? item.answer ?? '',
  };
}

/* ------------------------------------------------------------ действия */

const PATHS = { flashcards: 'flashcards', cases: 'cases', quizzes: 'quiz' };

/** Създаване. Връща записа от сървъра (носи истинския идентификатор). */
export async function createItem(kind, subjId, item) {
  const seg = PATHS[kind];
  const payload =
    kind === 'flashcards' ? toFlashPayload(subjId, item)
    : kind === 'cases' ? toCasePayload(subjId, item)
    : toQuizPayload(subjId, item);
  return send('POST', `/subjects/${encodeURIComponent(subjId)}/${seg}`, payload);
}

/** Редакция на съществуващ запис — иска идентификатора му от базата. */
export async function updateItem(kind, item) {
  if (!item || !item.id) throw new Error('Записът няма идентификатор от базата');
  const seg = PATHS[kind];
  const subjId = item.__subject;
  const payload =
    kind === 'flashcards' ? toFlashPayload(subjId, item)
    : kind === 'cases' ? toCasePayload(subjId, item)
    : toQuizPayload(subjId, item);
  return send('PATCH', `/${seg}/${item.id}`, payload);
}

export async function deleteItem(kind, item) {
  if (!item || !item.id) throw new Error('Записът няма идентификатор от базата');
  return send('DELETE', `/${PATHS[kind]}/${item.id}`);
}

/** Историята на промените по един запис — кой, кога и какво е било преди. */
export async function revisions(entityType, id) {
  return send('GET', `/revisions/${entityType}/${id}`);
}
