/* Автоматично добавени връзки при разделянето на монолита. */
import { getFlashcards } from './01-seed.js';
import { saveState } from './09-backend-integraciya.js';
import { recordActivity, todayStr } from './11-topic-progress-streak-theme.js';
import { Activity } from './14-data-service.js';
import { updateTopicProgress } from './17-feature.js';

/* =============================================================================
   SRS — spaced repetition (SM-2-style, Anki-flavored)
   ============================================================================= */
const SRS_DAY_MS = 86400000;
const SRS_DEFAULT_NEW_PER_DAY = 15;
const SRS_MAX_IVL = 365;

function cardId(card) {
  const s = String(card.q || '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 120);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h * 31) + s.charCodeAt(i)) | 0;
  return 'c' + (h >>> 0).toString(36);
}
function srsResetToday(subjId) {
  const today = todayStr();
  if (!state.srsToday[subjId] || state.srsToday[subjId].date !== today) {
    state.srsToday[subjId] = { date: today, newDone: 0, reviewsDone: 0 };
  }
  return state.srsToday[subjId];
}
function srsConfigFor(subjId) {
  if (!state.srsConfig[subjId]) state.srsConfig[subjId] = { newPerDay: SRS_DEFAULT_NEW_PER_DAY };
  return state.srsConfig[subjId];
}
function srsInit(subjId, id) {
  if (!state.srs[subjId]) state.srs[subjId] = {};
  if (!state.srs[subjId][id]) {
    state.srs[subjId][id] = { ease: 2.5, ivl: 0, due: 0, reps: 0, lapses: 0, last: 0 };
  }
  return state.srs[subjId][id];
}
function srsBuildQueue(subjId) {
  const cards = getFlashcards(subjId) || [];
  srsResetToday(subjId);
  const cfg = srsConfigFor(subjId);
  const newRemaining = Math.max(0, (cfg.newPerDay || SRS_DEFAULT_NEW_PER_DAY) - state.srsToday[subjId].newDone);
  const now = Date.now();
  const due = [], fresh = [];
  cards.forEach((c, i) => {
    const id = cardId(c);
    const st = state.srs[subjId] && state.srs[subjId][id];
    if (!st || st.reps === 0) fresh.push({ card: c, idx: i, id, isNew: true });
    else if (st.due <= now) due.push({ card: c, idx: i, id, isNew: false, st });
  });
  // shuffle each pile
  function shuf(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }
  shuf(due); shuf(fresh);
  return { due, fresh: fresh.slice(0, newRemaining), totalCards: cards.length, dueAll: due.length, freshAll: fresh.length, newRemaining };
}
function srsTodayCount(subjId) {
  const q = srsBuildQueue(subjId);
  return q.due.length + q.fresh.length;
}
function srsGrade(subjId, id, grade /* 0..3 */) {
  const st = srsInit(subjId, id);
  const now = Date.now();
  const wasNew = (st.reps === 0);
  let ivl = st.ivl, ease = st.ease, reps = st.reps, lapses = st.lapses;
  if (grade === 0) {
    ease = Math.max(1.3, ease - 0.20);
    reps = 0;
    ivl = 0;
    lapses += 1;
    st.due = now + 10 * 60 * 1000; // 10 min relapse — back in same session
  } else if (reps === 0) {
    if (grade === 1) ivl = 1;
    else if (grade === 2) ivl = 1;
    else { ivl = 4; ease = Math.min(2.8, ease + 0.10); }
    reps = 1;
    st.due = now + ivl * SRS_DAY_MS;
  } else if (reps === 1) {
    if (grade === 1) { ivl = Math.max(2, Math.round(ivl * 1.2)); ease = Math.max(1.3, ease - 0.15); }
    else if (grade === 2) ivl = 6;
    else { ivl = 9; ease = Math.min(2.8, ease + 0.15); }
    reps = 2;
    st.due = now + ivl * SRS_DAY_MS;
  } else {
    if (grade === 1) { ivl = Math.max(ivl + 1, Math.round(ivl * 1.2)); ease = Math.max(1.3, ease - 0.15); }
    else if (grade === 2) ivl = Math.max(ivl + 1, Math.round(ivl * ease));
    else { ivl = Math.max(ivl + 1, Math.round(ivl * ease * 1.3)); ease = Math.min(2.8, ease + 0.15); }
    reps += 1;
    st.due = now + ivl * SRS_DAY_MS;
  }
  if (ivl > SRS_MAX_IVL) { ivl = SRS_MAX_IVL; st.due = now + ivl * SRS_DAY_MS; }
  st.ease = ease; st.ivl = ivl; st.reps = reps; st.lapses = lapses; st.last = now;
  srsResetToday(subjId);
  if (wasNew && grade > 0) state.srsToday[subjId].newDone += 1;
  state.srsToday[subjId].reviewsDone += 1;
  recordActivity();
  if (typeof Activity !== 'undefined') Activity.log('srs.grade', subjId, { grade, wasNew, ivl: st.ivl });
  // Auto-mark flashcards activity done for the card's topic (learning path)
  try {
    const cards = getFlashcards(subjId) || [];
    const card = cards.find(c => cardId(c) === id);
    if (card && typeof card.topicIdx === 'number' && typeof updateTopicProgress === 'function') {
      updateTopicProgress(subjId, card.topicIdx, 'flashcards', true);
    }
  } catch (e) { /* ignore */ }
  saveState();
}
function srsHumanIvl(days) {
  if (!days || days < 1) return '< 1 ден';
  if (days < 30) return days + (days === 1 ? ' ден' : ' дни');
  if (days < 365) return Math.round(days / 30) + ' мес.';
  return Math.round(days / 365) + ' год.';
}
function srsStats(subjId) {
  const cards = getFlashcards(subjId) || [];
  const sub = state.srs[subjId] || {};
  let learned = 0, mature = 0, young = 0, lapsed = 0;
  cards.forEach(c => {
    const st = sub[cardId(c)];
    if (!st || st.reps === 0) return;
    learned += 1;
    if (st.ivl >= 21) mature += 1; else young += 1;
    if (st.lapses > 0) lapsed += 1;
  });
  return { total: cards.length, learned, mature, young, lapsed, newCount: cards.length - learned };
}

export { SRS_DAY_MS, SRS_DEFAULT_NEW_PER_DAY, SRS_MAX_IVL, cardId, srsBuildQueue, srsConfigFor, srsGrade, srsHumanIvl, srsInit, srsResetToday, srsStats, srsTodayCount };
