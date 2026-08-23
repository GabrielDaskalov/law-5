/* Автоматично добавени връзки при разделянето на монолита. */
import { SUBJECTS } from './00-seed.js';
import { getConspect } from './04-glossary.js';
import { $, escapeHtml, isLoggedIn, ownsSubject, toast } from './10-helpers.js';
import { examDrawSaveAttempt } from './13-exam-draw.js';
import { render404 } from './56-404.js';

/* =============================================================================
   PAGES — Exam draw run (timed simulation)
   ============================================================================= */
function renderExamDrawRun(id) {
  if (!isLoggedIn()) { location.hash = '#/login'; return; }
  const s = SUBJECTS.find(x => x.id === id);
  if (!s) return render404();
  if (!ownsSubject(id)) { location.hash = '#/subject/' + id; return; }

  const params = new URLSearchParams((location.hash.split('?')[1]) || '');
  const topics = (params.get('topics') || '').split(',').filter(x => x !== '').map(Number);
  const min = parseInt(params.get('min'), 10) || 30;
  const start = parseInt(params.get('start'), 10) || Date.now();
  if (!topics.length) { location.hash = '#/exam-draw/' + id; return; }

  const chapters = s.chapters || [];
  const conspect = getConspect(id);

  // Session state — persists across re-renders (reveal toggle, ratings, notes)
  if (!window.__edrRun || window.__edrRun.key !== topics.join(',') + ':' + start) {
    window.__edrRun = {
      key: topics.join(',') + ':' + start,
      revealed: false,
      submitted: false,
      ratings: topics.map(() => null),
      notes: topics.map(() => ''),
    };
  }
  const sess = window.__edrRun;

  function fmtTime(sec) {
    if (sec <= 0) return '00:00';
    const m = Math.floor(sec / 60), s = sec % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  const totalSec = min * 60;
  const elapsed = Math.floor((Date.now() - start) / 1000);
  const remaining = Math.max(0, totalSec - elapsed);

  $('#app').innerHTML = `
    <div class="edr-page">
      <div class="edr-head"><div class="container edr-head-row">
        <a href="#/exam-draw/${id}" class="edr-back" onclick="if(!confirm('Да изоставиш ли билета? Бележките няма да бъдат запазени.'))event.preventDefault();">← Назад</a>
        <div id="edrTimer" class="edr-timer">${fmtTime(remaining)}</div>
        <div>
          ${sess.revealed
            ? `<button class="btn btn-gold" onclick="window.__edrFinish('${id}')">Запиши и приключи</button>`
            : `<button class="btn btn-outline" onclick="window.__edrReveal('${id}')">Покажи отговорите</button>`}
        </div>
      </div></div>

      <div class="edr-body">
        <div class="edr-billet">
          <div class="edr-billet-tag">Изтеглен билет</div>
          ${topics.map((t, i) => `
            <h2><span class="num">${i + 1}.</span>${escapeHtml(chapters[t] || ('Тема ' + (t + 1)))}</h2>
          `).join('')}
          <div style="font-size:12px;color:var(--text-3);margin-top:8px;">${escapeHtml(s.name)} · ${min} мин подготовка</div>
        </div>

        ${topics.map((t, i) => {
          const title = chapters[t] || ('Тема ' + (t + 1));
          const cons = conspect[t];
          const noteVal = sess.notes[i] || '';
          return `
            <div class="edr-topic-block">
              <h3>${i + 1}. ${escapeHtml(title)}</h3>
              <textarea class="edr-textarea" id="edrNote-${i}" placeholder="Напиши план или изложение по темата…" oninput="window.__edrNoteIn(${i}, this.value)">${escapeHtml(noteVal)}</textarea>
              ${sess.revealed && cons ? `
                <div class="edr-reveal">
                  <h4>Конспект — за сверяване</h4>
                  ${(cons.sections || []).slice(0, 6).map(sec => `
                    <div class="sec">
                      <div class="sec-title">${escapeHtml(sec.title || '')}</div>
                      <div class="sec-body">${(sec.blocks || []).slice(0, 3).map(b => {
                        if (b.t === 'list') return '<ul style="margin:4px 0 0 18px;">' + (b.items || []).slice(0, 5).map(it => '<li>' + escapeHtml(String(it).slice(0, 180)) + '</li>').join('') + '</ul>';
                        return escapeHtml(String(b.text || '').slice(0, 280));
                      }).join('<br/>')}</div>
                    </div>`).join('')}
                  ${cons.refs && cons.refs.length ? `<div class="sec"><div class="sec-title">Препратки</div><div class="sec-body">${escapeHtml(cons.refs.join(', '))}</div></div>` : ''}
                </div>
                <div class="edr-rate-row">
                  <span class="lbl">Самооценка:</span>
                  ${[0, 1, 2, 3].map(g => `<button class="edr-rate-btn ${sess.ratings[i] === g ? 'active' : ''}" onclick="window.__edrRate(${i}, ${g})">${['Не знам', 'Половин', 'Добре', 'Отлично'][g]}</button>`).join('')}
                </div>` : (sess.revealed ? '<div style="margin-top:10px;color:var(--text-3);font-size:12px;">(Конспектът за тази тема още не е разработен.)</div>' : '')}
            </div>`;
        }).join('')}

        ${!sess.revealed ? `
          <div class="edr-actions">
            <button class="btn btn-gold btn-lg" onclick="window.__edrReveal('${id}')">Готов съм — покажи отговорите</button>
          </div>` : ''}
      </div>
    </div>`;

  // start timer
  if (window.__edrTimerInt) clearInterval(window.__edrTimerInt);
  if (!sess.revealed) {
    window.__edrTimerInt = setInterval(() => {
      const el2 = document.getElementById('edrTimer');
      if (!el2) { clearInterval(window.__edrTimerInt); return; }
      const left = Math.max(0, totalSec - Math.floor((Date.now() - start) / 1000));
      el2.textContent = fmtTime(left);
      el2.classList.remove('warn', 'crit');
      if (left <= 60) el2.classList.add('crit');
      else if (left <= 5 * 60) el2.classList.add('warn');
      if (left === 0) {
        clearInterval(window.__edrTimerInt);
        window.__edrReveal(id);
      }
    }, 1000);
  }
}
window.__edrNoteIn = function (i, val) {
  if (window.__edrRun) window.__edrRun.notes[i] = val;
};
window.__edrReveal = function (id) {
  if (!window.__edrRun) return;
  window.__edrRun.revealed = true;
  renderExamDrawRun(id);
};
window.__edrRate = function (i, g) {
  if (!window.__edrRun) return;
  window.__edrRun.ratings[i] = g;
  renderExamDrawRun(window.__edrRun._sid || (location.hash.match(/exam-draw-run\/([^?]+)/) || [, ''])[1]);
};
window.__edrFinish = function (id) {
  const sess = window.__edrRun;
  if (!sess) { location.hash = '#/exam-draw/' + id; return; }
  // save attempt
  const params = new URLSearchParams((location.hash.split('?')[1]) || '');
  const topics = (params.get('topics') || '').split(',').filter(x => x !== '').map(Number);
  const min = parseInt(params.get('min'), 10) || 30;
  const ratings = sess.ratings.filter(r => r !== null);
  examDrawSaveAttempt(id, {
    ts: Date.now(),
    topics,
    minutes: min,
    notes: sess.notes,
    ratings: ratings,
  });
  if (window.__edrTimerInt) clearInterval(window.__edrTimerInt);
  window.__edrRun = null;
  toast('Билетът е записан в историята', true);
  location.hash = '#/exam-draw/' + id;
};

export { renderExamDrawRun };
