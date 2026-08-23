/* Автоматично добавени връзки при разделянето на монолита. */
import { SUBJECTS } from './00-seed.js';
import { el, escapeHtml, isLoggedIn, toast } from './10-helpers.js';

/* =============================================================================
   v4 UPGRADES — Theme, Streak, Achievements, Command Palette, Pomodoro, Focus
   ============================================================================= */

// ---------- Theme (dark/light) ----------
function initTheme() {
      const saved = localStorage.getItem('pa_theme');
      if (saved) { document.documentElement.setAttribute('data-theme', saved); return; }
      // няма личен избор → следвай системната тема на устройството
      const sysDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', sysDark ? 'dark' : 'light');
      if (window.matchMedia) {
        try {
          window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            if (!localStorage.getItem('pa_theme')) document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
          });
        } catch (e) {}
      }
    }
function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('pa_theme', next);
  if (typeof toast === 'function') toast(next === 'dark' ? 'Тъмна тема' : 'Светла тема');
}
initTheme();

// ---------- Streak tracking ----------
function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function dayDiff(a, b) {
  return Math.round((new Date(b).setHours(0,0,0,0) - new Date(a).setHours(0,0,0,0)) / 86400000);
}
function getStreak() {
  try {
    return JSON.parse(localStorage.getItem('pa_streak') || '{}');
  } catch { return {}; }
}
function bumpStreak(count) {
  const s = getStreak();
  const today = todayKey();
  s.calendar = s.calendar || {};
  s.calendar[today] = (s.calendar[today] || 0) + (count || 1);
  if (s.lastDay === today) {
    // same day, no streak change
  } else if (s.lastDay && dayDiff(s.lastDay, today) === 1) {
    s.days = (s.days || 0) + 1;
  } else if (!s.lastDay || dayDiff(s.lastDay, today) > 1) {
    s.days = 1;
  }
  s.lastDay = today;
  s.best = Math.max(s.best || 0, s.days || 0);
  localStorage.setItem('pa_streak', JSON.stringify(s));
  updateStreakChip();
  checkAchievements();
  return s;
}
function updateStreakChip() {
  const s = getStreak();
  const el = document.getElementById('streakChip');
  if (el) el.innerHTML = `<span class="flame">🔥</span><span>${s.days || 0}</span>`;
}

// ---------- Achievements ----------
const ACHIEVEMENTS = [
  { id: 'first-card', emoji: '🎯', name: 'Първата карта', hint: 'Разгледай първа флашкарта', check: () => (JSON.parse(localStorage.getItem('pa_srs')||'{}').totalReviewed || 0) >= 1 },
  { id: 'ten-cards', emoji: '🃏', name: '10 карти', hint: 'Прегледай 10 флашкарти', check: () => (JSON.parse(localStorage.getItem('pa_srs')||'{}').totalReviewed || 0) >= 10 },
  { id: 'hundred-cards', emoji: '💯', name: '100 карти', hint: '100 флашкарти прегледани', check: () => (JSON.parse(localStorage.getItem('pa_srs')||'{}').totalReviewed || 0) >= 100 },
  { id: 'first-quiz', emoji: '🎓', name: 'Първи тест', hint: 'Завърши първи тест', check: () => (JSON.parse(localStorage.getItem('pa_quiz')||'{}').completed || 0) >= 1 },
  { id: 'quiz-perfect', emoji: '⭐', name: 'Перфектен резултат', hint: '100% на тест', check: () => (JSON.parse(localStorage.getItem('pa_quiz')||'{}').perfect || 0) >= 1 },
  { id: 'streak-3', emoji: '🔥', name: '3 дни поред', hint: 'Учи 3 дни поред', check: () => (getStreak().days || 0) >= 3 },
  { id: 'streak-7', emoji: '⚡', name: 'Една седмица', hint: 'Учи 7 дни поред', check: () => (getStreak().days || 0) >= 7 },
  { id: 'streak-30', emoji: '🏆', name: 'Един месец', hint: 'Учи 30 дни поред', check: () => (getStreak().days || 0) >= 30 },
  { id: 'streak-100', emoji: '💎', name: '100 дни streak', hint: 'Легенда — 100 дни поред', check: () => (getStreak().days || 0) >= 100 },
  { id: 'first-case', emoji: '⚖️', name: 'Първи казус', hint: 'Реши първи казус', check: () => (JSON.parse(localStorage.getItem('pa_cases')||'{}').solved || 0) >= 1 },
  { id: 'ten-cases', emoji: '📜', name: '10 казуса', hint: '10 казуса решени', check: () => (JSON.parse(localStorage.getItem('pa_cases')||'{}').solved || 0) >= 10 },
  { id: 'first-ticket', emoji: '🎫', name: 'Първи билет', hint: 'Изтегли първи билет', check: () => (JSON.parse(localStorage.getItem('pa_exam')||'{}').drawn || 0) >= 1 },
  { id: 'ten-tickets', emoji: '🎖️', name: '10 билета', hint: '10 изтеглени билета', check: () => (JSON.parse(localStorage.getItem('pa_exam')||'{}').drawn || 0) >= 10 },
  { id: 'first-pomo', emoji: '🍅', name: 'Първи Pomodoro', hint: 'Завърши 25 мин фокус', check: () => (JSON.parse(localStorage.getItem('pa_pomo')||'{}').total || 0) >= 1 },
  { id: 'ten-pomo', emoji: '⏰', name: '10 Pomodoros', hint: '10 pomodoro сесии', check: () => (JSON.parse(localStorage.getItem('pa_pomo')||'{}').total || 0) >= 10 },
  { id: 'night-owl', emoji: '🦉', name: 'Нощна сова', hint: 'Учи след 23:00', check: () => new Date().getHours() >= 23 || new Date().getHours() < 5 },
  { id: 'early-bird', emoji: '🌅', name: 'Ранобудник', hint: 'Учи преди 7:00', check: () => new Date().getHours() >= 5 && new Date().getHours() < 7 },
  { id: 'subject-complete', emoji: '👑', name: 'Дисциплина завършена', hint: 'Завърши цяла дисциплина', check: () => false }, // placeholder
];
function getUnlockedAch() {
  try { return JSON.parse(localStorage.getItem('pa_ach') || '[]'); } catch { return []; }
}
function checkAchievements() {
  const unlocked = getUnlockedAch();
  const newlyUnlocked = [];
  ACHIEVEMENTS.forEach(a => {
    if (!unlocked.includes(a.id) && a.check()) {
      unlocked.push(a.id);
      newlyUnlocked.push(a);
    }
  });
  if (newlyUnlocked.length) {
    localStorage.setItem('pa_ach', JSON.stringify(unlocked));
    newlyUnlocked.forEach(a => showAchToast(a));
  }
}
function showAchToast(a) {
  // Не заливаме гост/нов посетител: само влезли, не в първите 5 сек
  if (!isLoggedIn()) return;
  if (window.__pageLoadedAt && Date.now() - window.__pageLoadedAt < 5000) return;
  const t = document.createElement('div');
  t.className = 'ach-toast';
  t.innerHTML = `<div class="ach-icon">${a.emoji}</div><div class="ach-text"><div class="ach-title">Ново постижение!</div><div class="ach-desc">${a.name}</div></div>`;
  document.body.appendChild(t);
  setTimeout(() => t.style.transition = 'opacity 0.5s', 3500);
  setTimeout(() => t.style.opacity = '0', 4000);
  setTimeout(() => t.remove(), 4700);
}

function renderHeatmap() {
  const cal = (getStreak().calendar) || {};
  const cells = [];
  const today = new Date(); today.setHours(0,0,0,0);
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    const v = cal[key] || 0;
    const lvl = v === 0 ? '' : v < 5 ? 'l1' : v < 15 ? 'l2' : v < 30 ? 'l3' : 'l4';
    cells.push(`<div class="heatmap-cell ${lvl}" title="${key}: ${v} действия"></div>`);
  }
  return `<div class="heatmap">${cells.join('')}</div>`;
}

function renderAchievementsGrid() {
  const unlocked = getUnlockedAch();
  return `<div class="ach-grid">${ACHIEVEMENTS.map(a => `
    <div class="ach-card ${unlocked.includes(a.id) ? 'unlocked' : 'locked'}">
      <div class="ach-emoji">${unlocked.includes(a.id) ? a.emoji : '🔒'}</div>
      <div class="ach-name">${a.name}</div>
      <div class="ach-hint">${a.hint}</div>
    </div>
  `).join('')}</div>`;
}

// ---------- Command palette (Cmd+K) ----------
let cmdSel = 0, cmdItems = [];
function openCmdPalette() {
  if (document.querySelector('.cmd-backdrop')) return;
  const items = getCmdItems('');
  const html = `
    <div class="cmd-backdrop" onclick="if(event.target===this)closeCmdPalette()">
      <div class="cmd-modal">
        <div class="cmd-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input class="cmd-input" id="cmdInput" placeholder="Търси тема, дисциплина, действие…" oninput="updateCmdResults(this.value)" onkeydown="cmdKey(event)" autocomplete="off">
          <span class="cmd-kbd">ESC</span>
        </div>
        <div class="cmd-results" id="cmdResults">${renderCmdResults(items)}</div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  setTimeout(() => document.getElementById('cmdInput')?.focus(), 30);
  cmdSel = 0;
}
function closeCmdPalette() {
  document.querySelector('.cmd-backdrop')?.remove();
}
function getCmdItems(query) {
  const q = (query || '').toLowerCase().trim();
  const items = [];
  // Actions
  const actions = [
    { icon: '🏠', label: 'Табло', sub: 'Начална страница', action: () => location.hash = '#/dashboard' },
    { icon: '📦', label: 'Всички пакети', sub: 'Дисциплини', action: () => location.hash = '#/packages' },
    { icon: '📕', label: 'Тетрадка на грешките', sub: 'Преговори сбърканите въпроси', action: () => location.hash = '#/mistakes' },
    { icon: '⭐', label: 'Постижения', sub: 'Виж наградите си', action: () => location.hash = '#/achievements' },
    { icon: '🔥', label: 'Streak', sub: 'Календар на активността', action: () => location.hash = '#/streak' },
    { icon: '🌓', label: 'Смени темата', sub: 'Тъмна / светла', action: () => toggleTheme() },
    { icon: '🍅', label: 'Pomodoro', sub: 'Стартирай 25 мин фокус', action: () => { if (!document.getElementById('pomoPanel').classList.contains('open')) togglePomo(); pomoStart(); } },
    { icon: '⚙️', label: 'Настройки', sub: 'Профил, парола, GDPR', action: () => location.hash = '#/settings' },
    { icon: '❓', label: 'Помощ / FAQ', sub: 'Често задавани въпроси', action: () => location.hash = '#/faq' },
    { icon: '🎫', label: 'Тегли билет', sub: 'Симулация на изпит', action: () => location.hash = '#/exam' },
  ];
  const subjects = (typeof SUBJECTS !== 'undefined') ? SUBJECTS.map(s => ({
    icon: '📚', label: s.name, sub: s.tagline || '', action: () => location.hash = '#/subject/' + s.id
  })) : [];
  const all = [...actions, ...subjects];
  if (!q) return all.slice(0, 15);
  return all.filter(x =>
    x.label.toLowerCase().includes(q) || (x.sub || '').toLowerCase().includes(q)
  ).slice(0, 20);
}
function renderCmdResults(items) {
  cmdItems = items;
  if (!items.length) return '<div class="cmd-empty">Няма резултати</div>';
  return items.map((it, i) => `
    <div class="cmd-item ${i === cmdSel ? 'selected' : ''}" data-idx="${i}" onclick="runCmd(${i})">
      <div class="cmd-icon">${it.icon}</div>
      <div><div class="cmd-label">${escapeHtml(it.label)}</div>${it.sub ? `<div class="cmd-sub">${escapeHtml(it.sub)}</div>` : ''}</div>
    </div>`).join('');
}
function updateCmdResults(q) {
  cmdSel = 0;
  document.getElementById('cmdResults').innerHTML = renderCmdResults(getCmdItems(q));
}
function cmdKey(e) {
  if (e.key === 'Escape') { closeCmdPalette(); return; }
  if (e.key === 'ArrowDown') { e.preventDefault(); cmdSel = Math.min(cmdSel + 1, cmdItems.length - 1); renderCmdSelection(); }
  if (e.key === 'ArrowUp') { e.preventDefault(); cmdSel = Math.max(cmdSel - 1, 0); renderCmdSelection(); }
  if (e.key === 'Enter') { e.preventDefault(); runCmd(cmdSel); }
}
function renderCmdSelection() {
  document.querySelectorAll('.cmd-item').forEach((el, i) => {
    el.classList.toggle('selected', i === cmdSel);
    if (i === cmdSel) el.scrollIntoView({ block: 'nearest' });
  });
}
function runCmd(i) {
  const it = cmdItems[i];
  if (!it) return;
  closeCmdPalette();
  try { it.action(); } catch (e) { console.error(e); }
}

// ---------- Pomodoro ----------
const POMO_WORK = 25 * 60, POMO_BREAK = 5 * 60;
let pomoState = { running: false, mode: 'work', remaining: POMO_WORK, timer: null };
function pomoData() {
  try { return JSON.parse(localStorage.getItem('pa_pomo') || '{}'); } catch { return {}; }
}
function togglePomo() {
  const p = document.getElementById('pomoPanel');
  p.classList.toggle('open');
  updatePomoDisplay();
}
function pomoStart() {
  if (pomoState.running) { pomoPause(); return; }
  pomoState.running = true;
  document.getElementById('pomoStart').textContent = 'Пауза';
  document.getElementById('pomoFab').classList.add('running');
  pomoState.timer = setInterval(() => {
    pomoState.remaining--;
    if (pomoState.remaining <= 0) {
      pomoFinish();
    } else {
      updatePomoDisplay();
    }
  }, 1000);
}
function pomoPause() {
  pomoState.running = false;
  clearInterval(pomoState.timer);
  document.getElementById('pomoStart').textContent = 'Продължи';
  document.getElementById('pomoFab').classList.remove('running');
}
function pomoReset() {
  clearInterval(pomoState.timer);
  pomoState.running = false;
  pomoState.mode = 'work';
  pomoState.remaining = POMO_WORK;
  document.getElementById('pomoStart').textContent = 'Старт';
  document.getElementById('pomoFab').classList.remove('running');
  updatePomoDisplay();
}
function pomoFinish() {
  clearInterval(pomoState.timer);
  pomoState.running = false;
  document.getElementById('pomoFab').classList.remove('running');
  if (pomoState.mode === 'work') {
    const d = pomoData();
    d.total = (d.total || 0) + 1;
    d.today = d.today || {};
    d.today[todayKey()] = (d.today[todayKey()] || 0) + 1;
    localStorage.setItem('pa_pomo', JSON.stringify(d));
    if (typeof toast === 'function') toast('🍅 Отлично! Време за почивка.');
    pomoState.mode = 'break';
    pomoState.remaining = POMO_BREAK;
    bumpStreak(5);
    checkAchievements();
  } else {
    if (typeof toast === 'function') toast('Почивката приключи. Готов ли си?');
    pomoState.mode = 'work';
    pomoState.remaining = POMO_WORK;
  }
  document.getElementById('pomoStart').textContent = 'Старт';
  updatePomoDisplay();
}
function updatePomoDisplay() {
  const el = document.getElementById('pomoTime');
  const modeEl = document.getElementById('pomoMode');
  const statsEl = document.getElementById('pomoStats');
  if (!el) return;
  const m = Math.floor(pomoState.remaining / 60);
  const s = pomoState.remaining % 60;
  el.textContent = m + ':' + String(s).padStart(2, '0');
  modeEl.textContent = pomoState.mode === 'work' ? 'Работа' : 'Почивка';
  const d = pomoData();
  const t = (d.today && d.today[todayKey()]) || 0;
  statsEl.textContent = t + ' pomodoros днес · ' + (d.total || 0) + ' общо';
}
function showPomoFab() {
  document.getElementById('pomoFab')?.classList.add('visible');
}
function hidePomoFab() {
  document.getElementById('pomoFab')?.classList.remove('visible');
  document.getElementById('pomoPanel')?.classList.remove('open');
}

// ---------- Focus mode ----------
function toggleFocusMode() {
  document.body.classList.toggle('focus-mode');
  if (typeof toast === 'function') {
    toast(document.body.classList.contains('focus-mode') ? 'Фокус режим ON (ESC за изход)' : 'Фокус режим OFF');
  }
}

// ---------- Keyboard shortcuts ----------
document.addEventListener('keydown', (e) => {
  // Cmd+K / Ctrl+K → command palette
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (document.querySelector('.cmd-backdrop')) closeCmdPalette();
    else openCmdPalette();
    return;
  }
  // ESC → exit focus mode / close command palette
  if (e.key === 'Escape') {
    if (document.querySelector('.cmd-backdrop')) closeCmdPalette();
    else if (document.body.classList.contains('focus-mode')) toggleFocusMode();
    return;
  }
  // Ignore other shortcuts when typing
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
  // D → toggle theme
  if (e.key === 'd' && !e.metaKey && !e.ctrlKey) { toggleTheme(); }
  // F → focus mode (only on conspect page)
  if (e.key === 'f' && location.hash.includes('/subject/') && location.hash.includes('conspect')) {
    e.preventDefault();
    toggleFocusMode();
  }
  // P → pomodoro
  if (e.key === 'p' && !e.metaKey && !e.ctrlKey) {
    if (!document.getElementById('pomoPanel').classList.contains('open')) showPomoFab();
    togglePomo();
  }
});

// ---------- Streak page ----------
function renderStreakPage() {
  const s = getStreak();
  const pomo = pomoData();
  document.getElementById('app').innerHTML = `
    <section class="page-head"><div class="container">
      <span class="eyebrow">Твоята активност</span>
      <h1 style="margin-top:14px;">🔥 ${s.days || 0} дни поред</h1>
      <p>Най-дълъг streak: ${s.best || 0} дни · Общо pomodoros: ${pomo.total || 0}</p>
    </div></section>
    <section style="padding:32px 0 80px;"><div class="container">
      <h3 style="margin-bottom:14px;">Календар на активността (последната година)</h3>
      ${renderHeatmap()}
      <p style="color:var(--text-3);font-size:12px;margin-top:12px;">Всеки квадрат = ден. По-тъмно = повече активност.</p>
    </div></section>`;
}

// ---------- Achievements page ----------
function renderAchievementsPage() {
  const unlocked = getUnlockedAch();
  document.getElementById('app').innerHTML = `
    <section class="page-head"><div class="container">
      <span class="eyebrow">Постижения</span>
      <h1 style="margin-top:14px;">🏆 ${unlocked.length} / ${ACHIEVEMENTS.length} отключени</h1>
      <p>Отключвай постижения, докато учиш. Мотивация в дневни малки победи.</p>
    </div></section>
    <section style="padding:32px 0 80px;"><div class="container">
      ${renderAchievementsGrid()}
    </div></section>`;
}

// ---------- Hook into router ----------
const _origRoute = window.route;
window.addEventListener('hashchange', () => {
  // streak/achievements вече се рендират от главния router
  // Show pomo fab on subject/study pages
  if (location.hash.includes('/subject/')) showPomoFab();
  else if (!document.getElementById('pomoPanel').classList.contains('open')) hidePomoFab();
});

// ---------- Bump streak on any activity ----------
window.addEventListener('load', () => {
  bumpStreak(1);
  // Hook counters (best-effort — only if UI exposes these)
  ['#/flashcards', '#/quiz', '#/review'].forEach(h => {
    // touched separately by feature-level code if it exists
  });
  // Initial routing — поема се от главния router
  // Wire streak chip into navbar if there's space
  const actions = document.getElementById('navActions');
  if (actions && !document.getElementById('streakChip')) {
    const chip = document.createElement('a');
    chip.href = '#/streak';
    chip.id = 'streakChip';
    chip.className = 'streak-chip';
    chip.title = 'Твоят streak';
    actions.insertBefore(chip, actions.firstChild);
    updateStreakChip();
  }
});

// ---------- Simple activity counters (for achievements) ----------
window.paActivity = {
  bump(kind, n) {
    n = n || 1;
    const key = 'pa_' + kind;
    let d;
    try { d = JSON.parse(localStorage.getItem(key) || '{}'); } catch { d = {}; }
    if (kind === 'srs') d.totalReviewed = (d.totalReviewed || 0) + n;
    if (kind === 'quiz') d.completed = (d.completed || 0) + n;
    if (kind === 'cases') d.solved = (d.solved || 0) + n;
    if (kind === 'exam') d.drawn = (d.drawn || 0) + n;
    localStorage.setItem(key, JSON.stringify(d));
    bumpStreak(n);
    checkAchievements();
  },
  quizPerfect() {
    let d;
    try { d = JSON.parse(localStorage.getItem('pa_quiz') || '{}'); } catch { d = {}; }
    d.perfect = (d.perfect || 0) + 1;
    localStorage.setItem('pa_quiz', JSON.stringify(d));
    checkAchievements();
  }
};

// ---------- PWA install (basic) ----------
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById('pwaInstall');
  if (btn) btn.classList.add('available');
});
function pwaInstall() {
  if (!deferredPrompt) { toast && toast('Инсталацията не е налична в този браузър'); return; }
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then(() => { deferredPrompt = null; });
}

export { ACHIEVEMENTS, POMO_BREAK, POMO_WORK, _origRoute, bumpStreak, checkAchievements, closeCmdPalette, cmdItems, cmdKey, cmdSel, dayDiff, deferredPrompt, getCmdItems, getStreak, getUnlockedAch, hidePomoFab, initTheme, openCmdPalette, pomoData, pomoFinish, pomoPause, pomoReset, pomoStart, pomoState, pwaInstall, renderAchievementsGrid, renderAchievementsPage, renderCmdResults, renderCmdSelection, renderHeatmap, renderStreakPage, runCmd, showAchToast, showPomoFab, todayKey, toggleFocusMode, togglePomo, toggleTheme, updateCmdResults, updatePomoDisplay, updateStreakChip };
