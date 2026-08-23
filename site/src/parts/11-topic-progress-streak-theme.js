/* Автоматично добавени връзки при разделянето на монолита. */
import { saveState } from './09-backend-integraciya.js';

/* =============================================================================
   TOPIC PROGRESS / STREAK / THEME
   ============================================================================= */
function todayStr() { return new Date().toISOString().slice(0, 10); }

function markTopicDone(subjId, topicIdx) {
  if (!state.topicCompleted[subjId]) state.topicCompleted[subjId] = {};
  state.topicCompleted[subjId][topicIdx] = Date.now();
  state.lastTopic[subjId] = topicIdx;
  recordActivity();
  saveState();
}
function markTopicUndone(subjId, topicIdx) {
  if (state.topicCompleted[subjId]) delete state.topicCompleted[subjId][topicIdx];
  saveState();
}
function isTopicDone(subjId, topicIdx) {
  return !!(state.topicCompleted[subjId] && state.topicCompleted[subjId][topicIdx]);
}
function topicsDoneCount(subjId) {
  return state.topicCompleted[subjId] ? Object.keys(state.topicCompleted[subjId]).length : 0;
}
function setLastTopic(subjId, topicIdx) {
  state.lastTopic[subjId] = topicIdx;
  saveState();
}

function recordActivity() {
  const today = todayStr();
  if (!state.streakDays.includes(today)) {
    state.streakDays.push(today);
    state.streakDays = state.streakDays.slice(-90); // keep last 90
  }
  state.lastActiveDate = today;
}
function currentStreak() {
  if (!state.streakDays.length) return 0;
  const sorted = [...state.streakDays].sort();
  let streak = 0;
  let cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  // Walk backwards from today
  while (true) {
    const cs = cursor.toISOString().slice(0, 10);
    if (sorted.includes(cs)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      // Allow gap of 0 (streak continues only if today or yesterday active)
      if (streak === 0 && cs === todayStr()) {
        cursor.setDate(cursor.getDate() - 1);
        continue;
      }
      break;
    }
  }
  return streak;
}
function isActiveDay(ymd) { return state.streakDays.includes(ymd); }

export { currentStreak, isActiveDay, isTopicDone, markTopicDone, markTopicUndone, recordActivity, setLastTopic, todayStr, topicsDoneCount };
