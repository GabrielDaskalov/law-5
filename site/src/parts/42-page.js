/* Автоматично добавени връзки при разделянето на монолита. */
import { SUBJECTS } from './00-seed.js';
import { $, escapeHtml, isLoggedIn, ownsSubject, toast } from './10-helpers.js';
import { topicsDoneCount } from './11-topic-progress-streak-theme.js';
import { examDrawHistoryFor, examDrawPick } from './13-exam-draw.js';
import { render404 } from './56-404.js';

/* =============================================================================
   PAGES — Exam draw (Тегли билет — setup)
   ============================================================================= */
function renderExamDraw(id) {
  if (!isLoggedIn()) { location.hash = '#/login'; return; }
  const s = SUBJECTS.find(x => x.id === id);
  if (!s) return render404();
  if (!ownsSubject(id)) { location.hash = '#/subject/' + id; return; }

  const hist = examDrawHistoryFor(id);
  const chapters = s.chapters || [];
  // session defaults
  if (!window.__edrSetup) window.__edrSetup = {};
  if (!window.__edrSetup[id]) window.__edrSetup[id] = { n: 2, min: 30, scope: 'all' };
  const cfg = window.__edrSetup[id];

  function chip(val, current, attr) {
    return `<button class="ed-chip ${val === current ? 'active' : ''}" onclick="window.__edrSet('${id}','${attr}',${typeof val === 'string' ? `'${val}'` : val})">${attr === 'min' ? val + ' мин' : (attr === 'n' ? val + (val === 1 ? ' въпрос' : ' въпроса') : (val === 'all' ? 'Всички теми' : 'Само завършени'))}</button>`;
  }

  $('#app').innerHTML = `
    <section class="page-head">
      <div class="container">
        <a href="#/subject/${id}" style="font-size:12px;color:var(--text-3);text-decoration:none;">← ${escapeHtml(s.name)}</a>
        <div class="ed-page">
          <div class="ed-head">
            <h1>Тегли билет</h1>
            <p>Симулация на устен изпит. Случайно избрани теми, таймер, лично изложение.</p>
          </div>
          <div class="ed-form">
            <div class="row">
              <label>Брой въпроси в билета</label>
              <div class="ed-chips">${[1, 2, 3].map(n => chip(n, cfg.n, 'n')).join('')}</div>
            </div>
            <div class="row">
              <label>Време за подготовка</label>
              <div class="ed-chips">${[15, 30, 45, 60].map(v => chip(v, cfg.min, 'min')).join('')}</div>
            </div>
            <div class="row">
              <label>Обхват</label>
              <div class="ed-chips">${['all', 'done'].map(v => chip(v, cfg.scope, 'scope')).join('')}</div>
              <div style="font-size:12px;color:var(--text-3);margin-top:6px;">
                ${cfg.scope === 'done' ? `${topicsDoneCount(id)} от ${chapters.length} теми завършени` : `Цялата програма — ${chapters.length} теми`}
              </div>
            </div>
            <div class="ed-actions">
              <button class="btn btn-gold btn-lg" onclick="window.__edrStart('${id}')">Тегли билет →</button>
              <a href="#/subject/${id}" class="btn btn-outline">Назад</a>
            </div>
          </div>
          ${hist.length ? `
            <div class="ed-hist">
              <h3>Последни тегления</h3>
              ${hist.slice(0, 8).map(h => {
                const d = new Date(h.ts);
                const dateStr = d.getDate() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
                const titles = h.topics.map(t => chapters[t] || ('тема ' + (t + 1))).join(' · ');
                const avg = h.ratings && h.ratings.length ? (h.ratings.reduce((a, b) => a + b, 0) / h.ratings.length).toFixed(1) : '–';
                return `<div class="ed-hist-row">
                  <span class="date">${dateStr}</span>
                  <span class="topics">${escapeHtml(titles.slice(0, 90))}</span>
                  <span class="rating">${avg !== '–' ? '★ ' + avg : ''}</span>
                </div>`;
              }).join('')}
            </div>` : ''}
        </div>
      </div>
    </section>`;
}
window.__edrSet = function (id, attr, val) {
  if (!window.__edrSetup) window.__edrSetup = {};
  if (!window.__edrSetup[id]) window.__edrSetup[id] = { n: 2, min: 30, scope: 'all' };
  window.__edrSetup[id][attr] = val;
  renderExamDraw(id);
};
window.__edrStart = function (id) {
  const cfg = (window.__edrSetup && window.__edrSetup[id]) || { n: 2, min: 30, scope: 'all' };
  const topics = examDrawPick(id, cfg.n, { onlyDone: cfg.scope === 'done' });
  if (!topics.length) { toast('Няма налични теми в избрания обхват'); return; }
  const start = Date.now();
  location.hash = '#/exam-draw-run/' + id + '?topics=' + topics.join(',') + '&min=' + cfg.min + '&start=' + start;
};

export { renderExamDraw };
