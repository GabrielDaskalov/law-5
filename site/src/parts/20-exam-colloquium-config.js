/* Автоматично добавени връзки при разделянето на монолита. */
import { SUBJECTS } from './00-seed.js';
import { saveState } from './09-backend-integraciya.js';

/* =============================================================================
   EXAM / COLLOQUIUM CONFIG
   ============================================================================= */
function getExamConfig(id) {
  return state.examConfigs[id] || { examDate: '', examType: 'written', colloquia: [] };
}
function setExamConfig(id, cfg) {
  state.examConfigs[id] = { ...getExamConfig(id), ...cfg };
  saveState();
}
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr); target.setHours(0,0,0,0);
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.ceil((target - today) / 86400000);
}
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const months = ['яну.','фев.','март','апр.','май','юни','юли','авг.','сеп.','окт.','ное.','дек.'];
  return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
}
function getEvents(subjId) {
  // Returns sorted upcoming events for a subject (exam + colloquia)
  const cfg = getExamConfig(subjId);
  const events = [];
  if (cfg.examDate) {
    const d = daysUntil(cfg.examDate);
    if (d !== null && d >= 0) events.push({ type: 'exam', name: 'Изпит', date: cfg.examDate, days: d, examType: cfg.examType });
  }
  (cfg.colloquia || []).forEach((c, i) => {
    const d = daysUntil(c.date);
    if (d !== null && d >= 0) events.push({ type: 'colloquium', name: c.name || ('Колоквиум ' + (i + 1)), date: c.date, days: d, topicsFrom: c.topicsFrom, topicsTo: c.topicsTo, examType: c.examType || 'written', idx: i });
  });
  return events.sort((a, b) => a.days - b.days);
}
function getNextEventGlobal() {
  let best = null;
  state.purchased.forEach(id => {
    const events = getEvents(id);
    if (events.length === 0) return;
    const ev = events[0];
    if (!best || ev.days < best.days) {
      const subj = SUBJECTS.find(s => s.id === id);
      best = Object.assign({}, ev, { subject: subj.name, subjId: id });
    }
  });
  return best;
}

export { daysUntil, formatDate, getEvents, getExamConfig, getNextEventGlobal, setExamConfig };
