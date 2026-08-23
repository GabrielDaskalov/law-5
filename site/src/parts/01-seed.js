/* Автоматично добавени връзки при разделянето на монолита. */
import { SUBJECTS } from './00-seed.js';

/* =============================================================================
   MOCK DATA — Flashcards (per subject)
   ============================================================================= */
/* ПРЕМАХНАТО: FLASHCARDS съдържаше учебен материал, зашит в кода.
   Точно това правеше редакцията невъзможна без програмист и качваше
   килограми в бъндъла. Материалът вече е в базата и се тегли през API-то
   според покупките. Оставена е празна стойност, за да не се пипат местата,
   които още се допитват до нея. */
const FLASHCARDS = {};


// Flashcards lookup — first check uploaded data, then curated, else generate
function getFlashcards(subjId) {
  // Admin override wins
  if (state.contentOverrides && state.contentOverrides.flashcards && state.contentOverrides.flashcards[subjId]) {
    return state.contentOverrides.flashcards[subjId];
  }
  if (window.PA_DATA && window.PA_DATA.flashcards && window.PA_DATA.flashcards[subjId]) {
    return window.PA_DATA.flashcards[subjId];
  }
  if (FLASHCARDS[subjId]) return FLASHCARDS[subjId];
  const subj = SUBJECTS.find(s => s.id === subjId);
  if (!subj) return [];
  return subj.chapters.slice(0, 6).map((ch, i) => ({
    q: 'Какви са основните характеристики на: ' + ch + '?',
    a: 'Темата <strong>' + ch + '</strong> в дисциплината "' + subj.name + '" обхваща ключови концепции.<ul><li>Понятие и характеристика</li><li>Правна уредба</li><li>Практическо приложение</li><li>Съдебна практика</li></ul>'
  }));
}

export { FLASHCARDS, getFlashcards };
