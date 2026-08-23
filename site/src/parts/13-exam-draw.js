/* Автоматично добавени връзки при разделянето на монолита. */
import { SUBJECTS } from './00-seed.js';
import { saveState } from './09-backend-integraciya.js';
import { isTopicDone, recordActivity } from './11-topic-progress-streak-theme.js';
import { Activity } from './14-data-service.js';

/* =============================================================================
   EXAM DRAW — "Тегли билет" simulation
   ============================================================================= */
function examDrawHistoryFor(subjId) {
  if (!state.examDrawHistory[subjId]) state.examDrawHistory[subjId] = [];
  return state.examDrawHistory[subjId];
}
function examDrawSaveAttempt(subjId, attempt) {
  examDrawHistoryFor(subjId).unshift(attempt);
  if (state.examDrawHistory[subjId].length > 20) state.examDrawHistory[subjId].length = 20;
  recordActivity();
  if (typeof Activity !== 'undefined') Activity.log('exam-draw.finish', subjId, { topics: attempt.topics.length, minutes: attempt.minutes });
  saveState();
}
function examDrawPick(subjId, n, opts) {
  // pick n distinct topic indices; honor scope (e.g., only завършени) if provided
  const s = SUBJECTS.find(x => x.id === subjId);
  const total = (s && s.chapters && s.chapters.length) || 0;
  if (!total) return [];
  let pool = [];
  for (let i = 0; i < total; i++) pool.push(i);
  if (opts && opts.onlyDone) pool = pool.filter(i => isTopicDone(subjId, i));
  if (!pool.length) { for (let i = 0; i < total; i++) pool.push(i); } // fallback
  // Fisher-Yates
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, Math.min(n, pool.length));
}

export { examDrawHistoryFor, examDrawPick, examDrawSaveAttempt };
