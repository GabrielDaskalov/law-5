/* =============================================================================
   STATE — localStorage
   ============================================================================= */
const STATE_KEY = 'pravoAcademy_v3';
window.state = {
  user: null,
  purchased: [],
  progress: {},
  fcDeck: {},
  examConfigs: {},
  uploads: { conspect: {}, cases: {} },
  plans: {},
  // New: per-subject per-topic completion tracking
  topicCompleted: {}, // { subjId: { topicIdx: timestamp } }
  lastTopic: {}, // { subjId: topicIdx }
  fcMastered: {}, // { subjId: count }
  // Streak tracking
  streakDays: [], // array of YYYY-MM-DD strings
  lastActiveDate: null,
  // Achievements
  badges: [],
  // Theme
  theme: 'light', // 'light' | 'dark'
  // SRS — spaced repetition (per-subject, per-card)
  srs: {},           // { subjId: { cardId: {ease, ivl, due, reps, lapses, last} } }
  srsConfig: {},     // { subjId: { newPerDay } }
  srsToday: {},      // { subjId: { date:'YYYY-MM-DD', newDone:int, reviewsDone:int } }
  // Exam-draw — "Тегли билет" simulation history
  examDrawHistory: {}, // { subjId: [ {ts, topics:[idx], minutes, notes:[str], ratings:[0..3]} ] }
  // Content overrides (admin edits stored here; merged on top of PA_DATA)
  contentOverrides: {}, // { flashcards:{subjId:[...]}, cases:{...}, quizzes:{...}, chapters:{...} }
  // Event log for analytics (admin panel reads from here)
  events: [],         // [ {ts, type, subj?, payload} ]  — capped at 500
  // Admin-only preferences
  adminTab: 'overview',
  // Notification preferences
  notifPrefs: { dailyReminder: true, weeklyReport: true, newContent: true, marketing: false },
  // Cookie consent (functional cookies are essential and don't require consent)
  cookieConsent: null, // null = not asked yet | 'accepted' | 'rejected' | 'essential-only'
  // Onboarding completion
  onboardingDone: false,
  // Support tickets — local for now; backend will sync
  supportTickets: [], // [{ id, subject, body, createdAt, status, replies:[{from,body,at}] }]
  // Account metadata (mock auth — backend will replace)
  userCreatedAt: null,
  // === CORE FEATURES v2 ===
  // Video content per topic — { subjId: { topicIdx: {url, provider, duration, watched, watchedAt, position} } }
  videos: {},
  // Learning path — activity checklist per topic
  // { subjId: { topicIdx: {conspect:bool, video:bool, flashcards:bool, quiz:bool, cases:bool, completedAt:ts} } }
  topicProgress: {},
  // Personal notes on conspect — { subjId: { topicIdx: [ {id, sectionIdx, color, quote, note, createdAt} ] } }
  notes: {},
  // Search history — last 10 queries
  searchHistory: [],
};

// Чисто копие на началното състояние — ползва се при смяна на профил
const DEFAULT_STATE_JSON = JSON.stringify(window.state);

function loadState() {
  try {
    const saved = localStorage.getItem(STATE_KEY);
    if (saved) state = { ...state, ...JSON.parse(saved) };
  } catch (e) { /* ignore */ }
}

export { DEFAULT_STATE_JSON, STATE_KEY, loadState };
