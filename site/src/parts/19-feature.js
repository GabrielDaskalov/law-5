/* Автоматично добавени връзки при разделянето на монолита. */
import { SUBJECTS } from './00-seed.js';
import { getFlashcards } from './01-seed.js';
import { getConspect } from './04-glossary.js';
import { getCases, getQuiz } from './05-case-studies.js';
import { saveState } from './09-backend-integraciya.js';
import { escapeHtml, ownsSubject, toast } from './10-helpers.js';
import { currentStreak } from './11-topic-progress-streak-theme.js';
import { allNotesForSubject } from './18-feature.js';

/* =============================================================================
   FEATURE — GLOBAL SEARCH across all content
   ============================================================================= */
function searchAll(query, opts) {
  opts = opts || {};
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 2) return { results: [], total: 0 };
  const subjectFilter = opts.subject;
  const typeFilter = opts.type;
  const results = [];
  const subjects = subjectFilter ? [SUBJECTS.find(s => s.id === subjectFilter)].filter(Boolean) : SUBJECTS;

  function push(r) { results.push(r); }
  function highlight(text, q) {
    if (!text) return '';
    // Изрязваме парче от текста, ЕКРАНИРАМЕ го и чак тогава слагаме <mark>.
    // Старият вариант махаше таговете с регулярен израз — но той хваща само
    // затворените (<b>), а отворен таг (<img src=x onerror=...) оцеляваше и
    // се изпълняваше. Единственият надежден ред е: екранирай, после форматирай.
    const t = String(text).replace(/<[^>]*>?/g, '');
    const i = t.toLowerCase().indexOf(q);
    if (i < 0) return escapeHtml(t.slice(0, 160));
    const start = Math.max(0, i - 60);
    const end = Math.min(t.length, i + q.length + 100);
    const snippet = (start > 0 ? '…' : '') + t.slice(start, end) + (end < t.length ? '…' : '');
    const bezopasen = escapeHtml(snippet);
    const igla = escapeHtml(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!igla) return bezopasen;
    return bezopasen.replace(new RegExp(igla, 'gi'), m => '<mark>' + m + '</mark>');
  }

  subjects.forEach(s => {
    if (!s || !ownsSubject(s.id)) return;
    // Conspect
    /* ПРОМЯНА: пълните текстове на конспектите вече не стоят в браузъра, а в
       базата. Затова, когато сървърът е върнал резултати (opts.serverConspects),
       ползваме тях; иначе се търси в това, което е свалено дотук. */
    if (!typeFilter || typeFilter === 'conspect') {
      const conspect = (opts.serverConspects && opts.serverConspects[s.id]) || getConspect(s.id) || [];
      conspect.forEach((topic, ti) => {
        (topic.sections || []).forEach((sec, si) => {
          (sec.blocks || []).forEach(b => {
            const text = b.text || (b.items ? b.items.join(' ') : '');
            if (text && text.toLowerCase().indexOf(q) !== -1) {
              push({ type: 'conspect', subj: s, topicIdx: ti, topicTitle: s.chapters[ti], sectionTitle: sec.title, snippet: highlight(text, q), link: '#/conspect/' + s.id + '?chapter=' + ti });
            }
          });
        });
      });
    }
    // Flashcards
    if (!typeFilter || typeFilter === 'flashcards') {
      const cards = getFlashcards(s.id) || [];
      cards.forEach((c, i) => {
        const hay = (String(c.q || '') + ' ' + String(c.a || '')).toLowerCase();
        if (hay.indexOf(q) !== -1) {
          push({ type: 'flashcards', subj: s, topicIdx: c.topicIdx || 0, topicTitle: s.chapters[c.topicIdx || 0], snippet: highlight(c.q, q) + ' → ' + highlight(c.a, q), link: '#/flashcards/' + s.id + '?topic=' + (c.topicIdx || 0) });
        }
      });
    }
    // Quiz
    if (!typeFilter || typeFilter === 'quiz') {
      const quiz = getQuiz(s.id) || [];
      quiz.forEach((qz, i) => {
        const hay = (String(qz.q || '') + ' ' + (qz.options || []).join(' ')).toLowerCase();
        if (hay.indexOf(q) !== -1) {
          push({ type: 'quiz', subj: s, topicIdx: qz.topicIdx || 0, topicTitle: s.chapters[qz.topicIdx || 0], snippet: highlight(qz.q, q), link: '#/quiz/' + s.id });
        }
      });
    }
    // Cases
    if (!typeFilter || typeFilter === 'cases') {
      const cases = getCases(s.id) || [];
      cases.forEach(c => {
        const hay = (String(c.title || '') + ' ' + String(c.facts || '') + ' ' + String(c.solution || '')).toLowerCase();
        if (hay.indexOf(q) !== -1) {
          push({ type: 'cases', subj: s, topicIdx: c.topicIdx || 0, topicTitle: s.chapters[c.topicIdx || 0], snippet: '<strong>' + escapeHtml(c.title || '') + '</strong> — ' + highlight(c.facts, q), link: '#/cases/' + s.id + '?topic=' + (c.topicIdx || 0) });
        }
      });
    }
    // Notes
    if (!typeFilter || typeFilter === 'notes') {
      allNotesForSubject(s.id).forEach(n => {
        const hay = (String(n.quote || '') + ' ' + String(n.note || '')).toLowerCase();
        if (hay.indexOf(q) !== -1) {
          push({ type: 'notes', subj: s, topicIdx: n.topicIdx, topicTitle: s.chapters[n.topicIdx], snippet: highlight(n.note, q), link: '#/conspect/' + s.id + '?chapter=' + n.topicIdx });
        }
      });
    }
  });

  // Save to history
  if (q && (!state.searchHistory[0] || state.searchHistory[0] !== q)) {
    state.searchHistory.unshift(q);
    state.searchHistory = state.searchHistory.slice(0, 10);
    saveState();
  }

  return { results: results.slice(0, 200), total: results.length };
}

function applyTheme() {
  // потребителят не е избирал тема → оставаме на системната (initTheme я е сложил)
  if (!localStorage.getItem('pa_theme') && state.theme !== 'dark') return;
  document.documentElement.setAttribute('data-theme', state.theme === 'dark' ? 'dark' : 'light');
}
/* ЗАБЕЛЕЖКА ПРИ РАЗДЕЛЯНЕТО: тази функция беше обявена два пъти в стария
   един файл. По-късната (в 57-v4-upgrades.js) я засенчваше и тя е тази,
   която реално работеше. Тук е преименувана, за да няма два еднакви
   символа, и остава само за справка. */
function toggleThemeLegacyUnused() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('pa_theme', state.theme); } catch (e) {}
  applyTheme();
  saveState();
  toast(state.theme === 'dark' ? 'Тъмна тема включена' : 'Светла тема включена');
}

function computeAchievements() {
  const earned = [];
  let totalCompleted = 0;
  Object.values(state.topicCompleted).forEach(s => totalCompleted += Object.keys(s).length);
  let totalMastered = 0;
  Object.values(state.fcMastered || {}).forEach(n => totalMastered += n || 0);
  if (totalCompleted >= 1) earned.push('first_topic');
  if (totalCompleted >= 10) earned.push('ten_topics');
  if (totalCompleted >= 50) earned.push('fifty_topics');
  if (currentStreak() >= 3) earned.push('streak_3');
  if (currentStreak() >= 7) earned.push('streak_7');
  if (currentStreak() >= 30) earned.push('streak_30');
  if (totalMastered >= 50) earned.push('cards_50');
  if (totalMastered >= 200) earned.push('cards_200');
  if (state.purchased.length >= 3) earned.push('three_subjects');
  return earned;
}

export { applyTheme, computeAchievements, searchAll, toggleThemeLegacyUnused };
