/* Автоматично добавени връзки при разделянето на монолита. */
import { saveState } from './09-backend-integraciya.js';
import { toast } from './10-helpers.js';

/* =============================================================================
   ТЕТРАДКА НА ГРЕШКИТЕ — сбърканите въпроси от тестовете се записват
   автоматично и могат да се преговарят отделно. Верен отговор при
   преговор ги маха от тетрадката.
   ============================================================================= */
function getMistakes() {
  if (!state.mistakes) state.mistakes = {};
  return state.mistakes;
}

/* ---------- Отметки на теми (bookmarks) ---------- */
function isBookmarked(sid, ti) {
  return (state.bookmarks || []).some(b => b.sid === sid && b.ti === ti);
}
function toggleBookmark(sid, ti) {
  if (!state.bookmarks) state.bookmarks = [];
  const i = state.bookmarks.findIndex(b => b.sid === sid && b.ti === ti);
  if (i >= 0) { state.bookmarks.splice(i, 1); toast('Темата е премахната от отбелязаните'); }
  else { state.bookmarks.push({ sid, ti, at: Date.now() }); toast('★ Темата е отбелязана — виж я в таблото', true); }
  saveState();
  const btn = document.getElementById('bmBtn');
  if (btn) btn.textContent = isBookmarked(sid, ti) ? '★ Отбелязана' : '☆ Отбележи темата';
}
function copyTopicLink() {
  const url = location.href;
  const done = () => toast('🔗 Линкът към темата е копиран', true);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(done).catch(() => toast(url));
  } else {
    const ta = document.createElement('textarea');
    ta.value = url; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast(url); }
    ta.remove();
  }
}

function recordMistake(subjId, q) {
  if (!q || !q.q) return;
  const m = getMistakes();
  if (!m[subjId]) m[subjId] = [];
  const existing = m[subjId].find(x => x.q === q.q);
  if (existing) {
    existing.times = (existing.times || 1) + 1;
    existing.lastAt = Date.now();
  } else {
    m[subjId].push({
      q: q.q,
      options: q.options || null,
      correct: q.correct,
      explain: q.explain || '',
      topicIdx: (typeof q.topicIdx === 'number') ? q.topicIdx : null,
      times: 1,
      addedAt: Date.now(),
      lastAt: Date.now(),
    });
  }
  saveState();
}

function clearMistake(subjId, questionText) {
  const m = getMistakes();
  if (!m[subjId]) return;
  m[subjId] = m[subjId].filter(x => x.q !== questionText);
  if (!m[subjId].length) delete m[subjId];
  saveState();
}

function eurToBgn(eur) {
  return (eur * 1.95583).toFixed(2).replace('.', ',') + ' лв';
}

function subjMistakes(subjId) {
  return (getMistakes()[subjId] || []);
}

function mistakesCount() {
  const m = getMistakes();
  return Object.values(m).reduce((n, arr) => n + arr.length, 0);
}

export { clearMistake, copyTopicLink, eurToBgn, getMistakes, isBookmarked, mistakesCount, recordMistake, subjMistakes, toggleBookmark };
