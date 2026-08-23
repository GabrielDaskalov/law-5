/**
 * Каталогът на дисциплините — от сървъра, не от кода.
 *
 * `SUBJECTS` е обявен в 00-seed.js като списък с имена, тагове и брой теми.
 * Целият сайт го чете директно, затова масивът НЕ се подменя с нов, а се
 * пълни на място (`length = 0` + `push`) — така всички съществуващи
 * препратки към него продължават да сочат вярно.
 *
 * Записите от кода остават като резервен вариант: ако сървърът е недостъпен,
 * витрината пак се показва, само че без реалните бройки.
 */
import { SUBJECTS } from '../parts/00-seed.js';
import { cached, loadCatalog } from './content.js';

let synced = false;

/** Слива данните от сървъра върху записа от кода, без да губи нищо. */
function merge(local, remote) {
  return {
    ...local,
    id: remote.code,
    name: remote.title || local.name,
    tagline: remote.tagline || local.tagline,
    year: remote.year ?? local.year,
    featured: remote.featured ?? local.featured,
    topics: remote.counts?.topics || local.topics,
    cards: remote.counts?.flashcards || local.cards,
    quizzes: remote.counts?.quizzes ?? local.quizzes,
    cases: remote.counts?.cases ?? local.cases,
    priceEur: remote.priceEur ?? local.priceEur,
    freeTopics: remote.access?.freeTopics ?? 0,
    granted: !!remote.access?.granted,
    // Заглавията на темите идват при отваряне на предмета.
    chapters: local.chapters,
  };
}

export async function syncCatalog() {
  if (synced) return SUBJECTS;

  let remote;
  try {
    remote = await loadCatalog();
  } catch (err) {
    // Без сървър остава списъкът от кода — витрината пак работи.
    return SUBJECTS;
  }
  if (!Array.isArray(remote) || remote.length === 0) return SUBJECTS;

  const byCode = new Map(remote.map((r) => [r.code, r]));
  const merged = [];

  // Първо познатите — за да се запази подредбата и текстовете от дизайна.
  for (const local of SUBJECTS) {
    const r = byCode.get(local.id);
    if (r) {
      merged.push(merge(local, r));
      byCode.delete(local.id);
    } else {
      // Дисциплина, която още не е качена в базата — остава както е.
      merged.push(local);
    }
  }
  // После новите, добавени от админа, за които няма запис в кода.
  for (const r of byCode.values()) {
    merged.push(
      merge(
        {
          id: r.code,
          name: r.title,
          year: r.year,
          topics: 0,
          lectures: 0,
          cards: 0,
          pages: 0,
          tagline: r.tagline || '',
          featured: false,
          chapters: [],
        },
        r,
      ),
    );
  }

  SUBJECTS.length = 0;
  SUBJECTS.push(...merged);
  synced = true;
  return SUBJECTS;
}

/** Заглавията на темите за един предмет, след като е зареден. */
export function syncSubjectChapters(code) {
  const entry = SUBJECTS.find((s) => s.id === code);
  if (!entry) return;
  const titles = cached.chapters(code).map((c) => c.heading);
  if (titles.length) {
    entry.chapters = titles;
    entry.topics = titles.length;
  }
}

/** След вход, изход или покупка правата са различни — каталогът се пресича. */
export function invalidateCatalog() {
  synced = false;
}

/**
 * Дисциплината, която админският панел показва по подразбиране.
 *
 * ВАЖНО: трябва да съвпада с `SUBJECTS[0].id` в renderAdminContent. Ако се
 * разминат, панелът показва една дисциплина, а се зарежда друга — и
 * списъкът излиза празен.
 */
export function defaultSubjectCode() {
  return SUBJECTS.length ? SUBJECTS[0].id : null;
}
