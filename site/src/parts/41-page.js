/* Автоматично добавени връзки при разделянето на монолита. */
import { SUBJECTS } from './00-seed.js';
import { saveState } from './09-backend-integraciya.js';
import { $, escapeHtml, isLoggedIn, ownsSubject, toast } from './10-helpers.js';
import { SRS_DEFAULT_NEW_PER_DAY, srsBuildQueue, srsConfigFor, srsGrade, srsHumanIvl, srsStats } from './12-srs.js';
import { render404 } from './56-404.js';

/* =============================================================================
   PAGES — Review (SRS)
   ============================================================================= */
function renderReview(id) {
  if (!isLoggedIn()) { location.hash = '#/login'; return; }
  const s = SUBJECTS.find(x => x.id === id);
  if (!s) return render404();
  if (!ownsSubject(id)) { location.hash = '#/subject/' + id; return; }

  // Build fresh session
  if (!window.__rvSession || window.__rvSession.subj !== id) {
    const q = srsBuildQueue(id);
    const queue = [...q.due, ...q.fresh];
    window.__rvSession = {
      subj: id, queue, idx: 0,
      grades: { 0: 0, 1: 0, 2: 0, 3: 0 },
      startTotal: queue.length,
      total: q.totalCards, dueAll: q.dueAll, freshAll: q.freshAll, newRemaining: q.newRemaining,
    };
  }
  const sess = window.__rvSession;
  const chapters = s.chapters || [];

  function exitSession() { window.__rvSession = null; }

  /* ---------------- EMPTY STATE ---------------- */
  if (sess.queue.length === 0) {
    const st = srsStats(id);
    const cfg = srsConfigFor(id);
    exitSession();
    $('#app').innerHTML = `
      <div class="rv-page">
        <div class="rv-head"><div class="container rv-head-row">
          <a href="#/subject/${id}" class="rv-back">← ${escapeHtml(s.name)}</a>
          <span class="rv-counter">Няма карти за днес</span>
        </div></div>
        <div class="container">
          <div class="rv-empty">
            <h3>Всичко научено за днес</h3>
            <p>Няма карти, които да чакат за повторение в момента. Върни се утре или прегледай нови карти от темите.</p>
            <div class="rv-meter">
              <div class="rv-meter-cell new"><div class="v">${st.newCount}</div><div class="k">Нови</div></div>
              <div class="rv-meter-cell young"><div class="v">${st.young}</div><div class="k">В обучение</div></div>
              <div class="rv-meter-cell mature"><div class="v">${st.mature}</div><div class="k">Усвоени</div></div>
              <div class="rv-meter-cell lapsed"><div class="v">${st.lapsed}</div><div class="k">С пропуски</div></div>
            </div>
            <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:18px;">
              <a href="#/flashcards/${id}" class="btn btn-gold">Учи нови карти</a>
              <a href="#/subject/${id}" class="btn btn-outline">Към дисциплината</a>
            </div>
            <div style="margin-top:18px;font-size:12px;color:var(--text-3);">
              Дневен лимит нови карти: ${cfg.newPerDay} ·
              <a href="#" onclick="window.__rvBumpNew('${id}');return false;" style="color:var(--gold);text-decoration:none;">+10 нови сега</a>
            </div>
          </div>
        </div>
      </div>`;
    return;
  }

  /* ---------------- CARD VIEW ---------------- */
  const item = sess.queue[sess.idx];
  const card = item.card;
  const isNew = item.isNew;
  const st = item.isNew ? null : item.st;
  const progress = (sess.idx / sess.startTotal) * 100;
  const topicTitle = chapters[card.topicIdx] || card.topic || '';
  const intervalText = grade => {
    // preview interval if user picks this grade — simplified
    const stCopy = st ? { ...st } : { ease: 2.5, ivl: 0, reps: 0, lapses: 0 };
    let ivl;
    if (grade === 0) return '<10 мин';
    if (stCopy.reps === 0) ivl = (grade === 3 ? 4 : 1);
    else if (stCopy.reps === 1) ivl = (grade === 1 ? Math.max(2, Math.round(stCopy.ivl * 1.2)) : grade === 2 ? 6 : 9);
    else ivl = (grade === 1 ? Math.max(stCopy.ivl + 1, Math.round(stCopy.ivl * 1.2))
                : grade === 2 ? Math.max(stCopy.ivl + 1, Math.round(stCopy.ivl * stCopy.ease))
                : Math.max(stCopy.ivl + 1, Math.round(stCopy.ivl * stCopy.ease * 1.3)));
    return srsHumanIvl(ivl);
  };

  $('#app').innerHTML = `
    <div class="rv-page">
      <div class="rv-head"><div class="container">
        <div class="rv-head-row">
          <a href="#/subject/${id}" class="rv-back" onclick="window.__rvSession=null;">← ${escapeHtml(s.name)}</a>
          <span class="rv-counter">Карта <strong>${sess.idx + 1}</strong> / ${sess.startTotal} · <span class="rv-pile"><span class="rv-pile-dot due"></span> ${sess.dueAll} <span class="rv-pile-dot new" style="margin-left:6px;"></span> ${Math.min(sess.freshAll, sess.newRemaining)}</span></span>
        </div>
        <div class="rv-progress"><div class="rv-progress-fill" style="width:${progress}%;"></div></div>
        <div class="rv-topic">
          ${isNew ? '<span class="rv-new-tag">НОВА</span>' : '<span class="rv-due-tag">ПОВТОРЕНИЕ</span>'}
          · ${escapeHtml(topicTitle)}
          ${st ? ` · повторения: ${st.reps} · улеснение: ${st.ease.toFixed(2)}` : ''}
        </div>
      </div></div>
      <div class="rv-stage">
        <div class="rv-card-wrap">
          <div class="rv-card" id="rvCard" onclick="this.classList.toggle('flipped'); window.__rvFlipped=true;">
            <div class="rv-card-inner">
              <div class="rv-face rv-face-front">
                <div class="rv-side-tag">Въпрос</div>
                <div class="rv-q">${escapeHtml(card.q)}</div>
                <div class="rv-tap-hint">Натисни картата, за да видиш отговора</div>
              </div>
              <div class="rv-face rv-face-back">
                <div class="rv-side-tag">Отговор</div>
                <div class="rv-a">${escapeHtml(card.a)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="rv-grades">
        <button class="rv-grade again" onclick="window.__rvGrade(0)">
          <span class="lab">Отново</span><span class="ivl">${intervalText(0)}</span>
        </button>
        <button class="rv-grade hard" onclick="window.__rvGrade(1)">
          <span class="lab">Трудно</span><span class="ivl">${intervalText(1)}</span>
        </button>
        <button class="rv-grade good" onclick="window.__rvGrade(2)">
          <span class="lab">Добре</span><span class="ivl">${intervalText(2)}</span>
        </button>
        <button class="rv-grade easy" onclick="window.__rvGrade(3)">
          <span class="lab">Лесно</span><span class="ivl">${intervalText(3)}</span>
        </button>
      </div>
    </div>`;
  window.__rvFlipped = false;
}

window.__rvGrade = function (grade) {
  const sess = window.__rvSession;
  if (!sess) return;
  // ensure card was flipped before grading (gentle nudge — but still grade)
  if (!window.__rvFlipped && grade > 0) {
    const c = document.getElementById('rvCard'); if (c) { c.classList.add('flipped'); window.__rvFlipped = true; }
    toast('Виж първо отговора, после оцени.');
    return;
  }
  const item = sess.queue[sess.idx];
  srsGrade(sess.subj, item.id, grade);
  sess.grades[grade] = (sess.grades[grade] || 0) + 1;
  // On "Again" — push card back to the end of queue (so it returns this session)
  if (grade === 0) {
    sess.queue.push({ ...item, isNew: false, st: state.srs[sess.subj][item.id] });
    sess.startTotal += 1;
  }
  sess.idx += 1;
  if (sess.idx >= sess.queue.length) {
    // Summary
    const sid = sess.subj;
    const summary = { ...sess.grades }, total = sess.idx;
    const st = srsStats(sid);
    window.__rvSession = null;
    $('#app').innerHTML = `
      <div class="rv-page">
        <div class="rv-head"><div class="container rv-head-row">
          <a href="#/subject/${sid}" class="rv-back">← ${escapeHtml((SUBJECTS.find(x => x.id === sid) || {}).name || '')}</a>
          <span class="rv-counter">Сесия завършена</span>
        </div></div>
        <div class="container">
          <div class="rv-summary">
            <h3>Готово!</h3>
            <p style="color:var(--text-2);">Прегледа ${total} ${total === 1 ? 'карта' : 'карти'} в тази сесия.</p>
            <div class="rv-summary-stats">
              <div class="rv-summary-stat"><div class="num r">${summary[0] || 0}</div><div class="lbl">Отново</div></div>
              <div class="rv-summary-stat"><div class="num o">${summary[1] || 0}</div><div class="lbl">Трудно</div></div>
              <div class="rv-summary-stat"><div class="num g">${summary[2] || 0}</div><div class="lbl">Добре</div></div>
              <div class="rv-summary-stat"><div class="num y">${summary[3] || 0}</div><div class="lbl">Лесно</div></div>
            </div>
            <h4 style="font-size:14px;color:var(--text-3);text-transform:uppercase;letter-spacing:0.05em;margin:18px 0 6px;">Общо състояние</h4>
            <div class="rv-meter">
              <div class="rv-meter-cell new"><div class="v">${st.newCount}</div><div class="k">Нови</div></div>
              <div class="rv-meter-cell young"><div class="v">${st.young}</div><div class="k">В обучение</div></div>
              <div class="rv-meter-cell mature"><div class="v">${st.mature}</div><div class="k">Усвоени</div></div>
              <div class="rv-meter-cell lapsed"><div class="v">${st.lapsed}</div><div class="k">С пропуски</div></div>
            </div>
            <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:18px;">
              <a href="#/review/${sid}" class="btn btn-gold">Още една сесия</a>
              <a href="#/subject/${sid}" class="btn btn-outline">Към дисциплината</a>
            </div>
          </div>
        </div>
      </div>`;
    return;
  }
  renderReview(sess.subj);
};

window.__rvBumpNew = function (sid) {
  const cfg = srsConfigFor(sid);
  cfg.newPerDay = (cfg.newPerDay || SRS_DEFAULT_NEW_PER_DAY) + 10;
  saveState();
  window.__rvSession = null;
  renderReview(sid);
};

export { renderReview };
