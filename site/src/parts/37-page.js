/* Автоматично добавени връзки при разделянето на монолита. */
import { SUBJECTS } from './00-seed.js';
import { $, $$, escapeHtml, isLoggedIn, ownsSubject, toast } from './10-helpers.js';
import { daysUntil, getExamConfig, setExamConfig } from './20-exam-colloquium-config.js';
import { iconSvg } from './27-page.js';
import { render404 } from './56-404.js';

/* =============================================================================
   PAGES — Exam setup (изпит и колоквиуми)
   ============================================================================= */
function renderExamSetup(id) {
  if (!isLoggedIn()) { location.hash = '#/login'; return; }
  const s = SUBJECTS.find(x => x.id === id);
  if (!s) return render404();
  if (!ownsSubject(id)) { location.hash = '#/subject/' + id; return; }

  const cfg = getExamConfig(id);

  function render() {
    const c = getExamConfig(id);
    $('#app').innerHTML = `
      <section class="page-head">
        <div class="container">
          <a href="#/subject/${id}" style="font-size:13px;color:var(--text-3);">← ${escapeHtml(s.name)}</a>
          <span class="eyebrow" style="margin-top:14px;">Изпит и колоквиуми</span>
          <h1 style="margin-top:10px;">${escapeHtml(s.name)}</h1>
          <p>Задай датата на изпита, типа (устен или писмен) и колоквиумите с обхвата от теми. Системата изготвя план съобразно това.</p>
        </div>
      </section>

      <section style="padding-bottom:80px;">
        <div class="container" style="max-width:760px;">

          <div class="setup-section">
            <h3>Дата на изпита</h3>
            <p class="setup-sub">Кога е финалният изпит по дисциплината.</p>
            <div style="display:grid;grid-template-columns:1fr auto;gap:12px;align-items:end;">
              <div class="field" style="margin:0;">
                <label>Дата на изпита</label>
                <input class="input" type="date" id="examDate" value="${c.examDate || ''}" min="${new Date().toISOString().slice(0, 10)}">
              </div>
              ${c.examDate ? `
                <div style="background:var(--gold-bg-2);border-radius:var(--radius-m);padding:10px 16px;text-align:center;">
                  <div style="font-size:10px;color:var(--gold-3);letter-spacing:0.08em;">ОСТАВАТ</div>
                  <div class="serif" style="font-size:20px;color:var(--navy);font-weight:500;">${daysUntil(c.examDate)} дни</div>
                </div>
              ` : ''}
            </div>
          </div>

          <div class="setup-section">
            <h3>Тип на изпита</h3>
            <p class="setup-sub">Различният тип води до различен план за подготовка.</p>
            <div class="exam-type-row">
              <div class="exam-type-card ${c.examType === 'written' ? 'selected' : ''}" data-type="written">
                <div class="et-icon">${iconSvg('written')}</div>
                <h4>Писмен</h4>
                <p>Фокус върху ясно структуриране на отговора, казуси с хронометър, писмена практика.</p>
              </div>
              <div class="exam-type-card ${c.examType === 'oral' ? 'selected' : ''}" data-type="oral">
                <div class="et-icon">${iconSvg('oral')}</div>
                <h4>Устен</h4>
                <p>Фокус върху изговаряне на глас, бързи асоциации, кратки структурирани отговори по теми.</p>
              </div>
            </div>
          </div>

          <div class="setup-section">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;">
              <div>
                <h3 style="margin-bottom:4px;">Колоквиуми</h3>
                <p class="setup-sub" style="margin-bottom:0;">Междинни оценки през семестъра. Задай дата и обхват от теми за всеки.</p>
              </div>
              <button class="btn btn-outline btn-sm" id="addColloquium">${iconSvg('plus')} Добави</button>
            </div>
            <div class="colloquia-list" id="colloquiaList">
              ${(c.colloquia || []).map((coll, idx) => colloquiumRow(coll, idx, s)).join('')}
              ${(c.colloquia || []).length === 0 ? '<p style="text-align:center;color:var(--text-3);font-size:13px;padding:14px;margin:0;">Няма добавени колоквиуми.</p>' : ''}
            </div>
          </div>

          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:24px;">
            <a href="#/subject/${id}" class="btn btn-outline">Отказ</a>
            <button class="btn btn-gold btn-lg" id="saveExam">Запази настройките</button>
          </div>
        </div>
      </section>
    `;

    // Wire up handlers
    $$('.exam-type-card').forEach(card => {
      card.addEventListener('click', () => {
        $$('.exam-type-card').forEach(c2 => c2.classList.remove('selected'));
        card.classList.add('selected');
      });
    });

    $('#addColloquium').addEventListener('click', () => {
      const c2 = getExamConfig(id);
      const colls = c2.colloquia || [];
      const num = colls.length + 1;
      const lastTo = colls.length > 0 ? colls[colls.length - 1].topicsTo : 0;
      colls.push({ name: 'Колоквиум ' + num, date: '', topicsFrom: lastTo + 1, topicsTo: Math.min(s.chapters.length, lastTo + Math.ceil(s.chapters.length / 3)), examType: 'written' });
      setExamConfig(id, { colloquia: colls });
      render();
    });

    $('#saveExam').addEventListener('click', () => {
      const examDate = $('#examDate').value;
      const examType = $$('.exam-type-card.selected')[0]?.dataset.type || 'written';
      const colls = $$('.colloquium-row').map(row => ({
        name: row.querySelector('.coll-name').value,
        date: row.querySelector('.coll-date').value,
        topicsFrom: parseInt(row.querySelector('.coll-from').value) || 1,
        topicsTo: parseInt(row.querySelector('.coll-to').value) || 1,
        examType: row.querySelector('.coll-type').value,
      }));
      setExamConfig(id, { examDate, examType, colloquia: colls });
      toast('Настройките са запазени', true);
      setTimeout(() => { location.hash = '#/subject/' + id; }, 600);
    });
  }

  function colloquiumRow(coll, idx, subj) {
    return `
      <div class="colloquium-row" data-idx="${idx}">
        <div class="field">
          <label>Име</label>
          <input class="input coll-name" value="${escapeHtml(coll.name || '')}" placeholder="Колоквиум ${idx + 1}">
        </div>
        <div class="field">
          <label>Дата</label>
          <input class="input coll-date" type="date" value="${coll.date || ''}">
        </div>
        <div class="field">
          <label>От тема</label>
          <input class="input coll-from" type="number" min="1" max="${subj.chapters.length}" value="${coll.topicsFrom || 1}">
        </div>
        <div class="field">
          <label>До тема</label>
          <input class="input coll-to" type="number" min="1" max="${subj.chapters.length}" value="${coll.topicsTo || subj.chapters.length}">
        </div>
        <div class="field" style="grid-column:1/-1;display:flex;gap:10px;align-items:end;margin:0;">
          <select class="select coll-type" style="flex:1;">
            <option value="written" ${coll.examType === 'written' ? 'selected' : ''}>Писмен</option>
            <option value="oral" ${coll.examType === 'oral' ? 'selected' : ''}>Устен</option>
          </select>
          <button class="btn btn-outline btn-sm" onclick="removeColloquium('${id}', ${idx})">${iconSvg('trash')} Премахни</button>
        </div>
      </div>
    `;
  }

  window.removeColloquium = function(subjId, idx) {
    const c = getExamConfig(subjId);
    c.colloquia.splice(idx, 1);
    setExamConfig(subjId, { colloquia: c.colloquia });
    renderExamSetup(subjId);
  };

  render();
}

export { renderExamSetup };
