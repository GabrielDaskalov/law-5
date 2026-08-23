/* Автоматично добавени връзки при разделянето на монолита. */
import { SUBJECTS } from './00-seed.js';
import { saveState } from './09-backend-integraciya.js';
import { markTopicDone } from './11-topic-progress-streak-theme.js';
import { Activity } from './14-data-service.js';
import { getVideo } from './16-feature.js';

/* =============================================================================
   FEATURE — LEARNING PATH / topic activity progression
   Per topic tracks which activities are complete. Auto-marks "topic done"
   when all applicable activities are complete.
   ============================================================================= */
const ACTIVITY_KEYS = ['conspect', 'video', 'flashcards', 'quiz', 'cases'];
function getTopicProgress(subjId, topicIdx) {
  const sub = state.topicProgress[subjId] || {};
  return sub[topicIdx] || {};
}
function updateTopicProgress(subjId, topicIdx, activity, done) {
  if (!state.topicProgress[subjId]) state.topicProgress[subjId] = {};
  if (!state.topicProgress[subjId][topicIdx]) state.topicProgress[subjId][topicIdx] = {};
  state.topicProgress[subjId][topicIdx][activity] = !!done;
  // Auto-mark topic completed when 4 of 5 (or 5 of 5) activities are done
  const p = state.topicProgress[subjId][topicIdx];
  const doneCount = ACTIVITY_KEYS.filter(k => p[k]).length;
  // Video only counts if a video exists for this topic
  const hasVideo = !!getVideo(subjId, topicIdx);
  const target = hasVideo ? 5 : 4;
  const applicable = ACTIVITY_KEYS.filter(k => k !== 'video' || hasVideo);
  const applicableDone = applicable.filter(k => p[k]).length;
  if (applicableDone >= applicable.length && !p.completedAt) {
    p.completedAt = Date.now();
    if (typeof markTopicDone === 'function') markTopicDone(subjId, topicIdx);
  }
  saveState();
  if (typeof Activity !== 'undefined') Activity.log('progress.' + activity, subjId, { topicIdx, done });
}
function topicActivitiesComplete(subjId, topicIdx) {
  const p = getTopicProgress(subjId, topicIdx);
  const hasVideo = !!getVideo(subjId, topicIdx);
  const applicable = ACTIVITY_KEYS.filter(k => k !== 'video' || hasVideo);
  return { done: applicable.filter(k => p[k]).length, total: applicable.length, applicable, isDone: !!p.completedAt };
}
function nextRecommendation(subjId) {
  // Find first topic that isn't fully complete
  const s = SUBJECTS.find(x => x.id === subjId);
  if (!s || !s.chapters) return null;
  for (let i = 0; i < s.chapters.length; i++) {
    const c = topicActivitiesComplete(subjId, i);
    if (!c.isDone) {
      const p = getTopicProgress(subjId, i);
      // Which activity next?
      const next = c.applicable.find(a => !p[a]) || 'conspect';
      return { topicIdx: i, title: s.chapters[i], nextActivity: next, done: c.done, total: c.total };
    }
  }
  return null; // all done
}

export { ACTIVITY_KEYS, getTopicProgress, nextRecommendation, topicActivitiesComplete, updateTopicProgress };
