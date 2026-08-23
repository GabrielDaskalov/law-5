/* Автоматично добавени връзки при разделянето на монолита. */
import { SUBJECTS } from './00-seed.js';
import { QUIZZES } from './02-seed.js';

/* =============================================================================
   CASE STUDIES (разработени казуси)
   ============================================================================= */
/* ПРЕМАХНАТО: CASE_CONTENT съдържаше учебен материал, зашит в кода.
   Точно това правеше редакцията невъзможна без програмист и качваше
   килограми в бъндъла. Материалът вече е в базата и се тегли през API-то
   според покупките. Оставена е празна стойност, за да не се пипат местата,
   които още се допитват до нея. */
const CASE_CONTENT = {};


function getCases(subjId) {
  // Admin override wins
  if (state.contentOverrides && state.contentOverrides.cases && state.contentOverrides.cases[subjId]) {
    return state.contentOverrides.cases[subjId];
  }
  // Prefer curated cases from PA_DATA (external data file) — supports 100+ cases per subject
  if (window.PA_DATA && window.PA_DATA.cases && Array.isArray(window.PA_DATA.cases[subjId])) {
    return window.PA_DATA.cases[subjId];
  }
  if (CASE_CONTENT[subjId]) return CASE_CONTENT[subjId];
  // Generate placeholders from chapter list for subjects without curated cases
  const subj = SUBJECTS.find(s => s.id === subjId);
  if (!subj) return [];
  return subj.chapters.slice(0, 4).map((ch, i) => ({
    num: i + 1,
    title: 'Казус по тема "' + ch + '"',
    topicIdx: i,
    facts: 'Практически случай по темата "' + ch + '" в дисциплината "' + subj.name + '". Студентът трябва да приложи изучените принципи и норми към конкретната фактическа ситуация.',
    questions: ['Каква е правната квалификация?', 'Кои разпоредби са приложими?', 'Какво е възможното решение?'],
    solution: 'Решението изисква анализ на основните институти от темата "' + ch + '". Подробна разработка с препратки към съдебната практика е достъпна в платформата.'
  }));
}

function getQuiz(subjId) {
  // Admin override wins
  if (state.contentOverrides && state.contentOverrides.quizzes && state.contentOverrides.quizzes[subjId]) {
    return state.contentOverrides.quizzes[subjId];
  }
  if (window.PA_DATA && window.PA_DATA.quizzes && window.PA_DATA.quizzes[subjId]) {
    return window.PA_DATA.quizzes[subjId];
  }
  if (QUIZZES[subjId]) return QUIZZES[subjId];
  const subj = SUBJECTS.find(s => s.id === subjId);
  if (!subj) return [];
  return subj.chapters.slice(0, 4).map((ch, i) => ({
    q: 'Кое от следните най-точно описва "' + ch + '"?',
    options: ['Първи вариант на отговора', 'Втори вариант на отговора', 'Трети вариант на отговора', 'Четвърти вариант на отговора'],
    correct: 1,
    explain: 'Темата "' + ch + '" е централна в дисциплината "' + subj.name + '". Препоръчително е допълнително разглеждане в конспекта.'
  }));
}

export { CASE_CONTENT, getCases, getQuiz };
