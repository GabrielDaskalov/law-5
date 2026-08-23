/* Автоматично добавени връзки при разделянето на монолита. */
import { SUBJECTS } from './00-seed.js';
import { $, $$, escapeHtml, isLoggedIn, ownsSubject, toast } from './10-helpers.js';
import { daysUntil, formatDate, getEvents, getExamConfig } from './20-exam-colloquium-config.js';
import { generatePlan } from './22-plan-generator.js';

/* =============================================================================
   PAGES — Plan Builder
   ============================================================================= */
function renderPlan(query) {
  if (!isLoggedIn()) { location.hash = '#/login'; return; }
  const purchased = SUBJECTS.filter(s => ownsSubject(s.id));

  if (purchased.length === 0) {
    $('#app').innerHTML = `
      <section class="page-head">
        <div class="container">
          <h1>Учебен план</h1>
          <p>Първо купи поне една дисциплина, за да изготвиш план.</p>
          <a href="#/packages" class="btn btn-gold" style="margin-top:14px;">Виж пакетите</a>
        </div>
      </section>
    `;
    return;
  }

  // Pre-select subject from query
  const params = new URLSearchParams(query || '');
  let activeSubjId = params.get('subject') || purchased[0].id;
  if (!ownsSubject(activeSubjId)) activeSubjId = purchased[0].id;

  function render() {
    const subj = SUBJECTS.find(s => s.id === activeSubjId);
    const cfg = getExamConfig(activeSubjId);
    const events = getEvents(activeSubjId);
    const existingPlan = state.plans[activeSubjId];

    $('#app').innerHTML = `
      <section class="page-head">
        <div class="container">
          <span class="eyebrow">Учебен план</span>
          <h1 style="margin-top:14px;">Изготви план за подготовка</h1>
          <p>Избери дисциплина, обхват от теми и краен срок. Системата ще раздели материала по дни според типа на изпита.</p>

          <div class="chip-row" style="margin-top:18px;">
            ${purchased.map(s => `
              <span class="chip ${s.id === activeSubjId ? 'active' : ''}" data-subj="${s.id}">${escapeHtml(s.name)}</span>
            `).join('')}
          </div>
        </div>
      </section>

      <section style="padding-bottom:80px;">
        <div class="container">
          <div class="pb-grid">
            <aside class="pb-form">
              <h3>Параметри на плана</h3>
              <p class="pb-sub">Зададените тук стойности определят разпределението по дни.</p>

              <div class="field">
                <label>Краен срок</label>
                <select class="select" id="pbDeadline">
                  ${cfg.examDate ? `<option value="exam">Изпит — ${formatDate(cfg.examDate)}</option>` : ''}
                  ${(cfg.colloquia || []).map((c, i) => c.date ? `<option value="coll_${i}">${escapeHtml(c.name)} — ${formatDate(c.date)}</option>` : '').filter(Boolean).join('')}
                  <option value="custom">Друга дата</option>
                </select>
              </div>

              <div class="field" id="customDateField" style="display:none;">
                <label>Избери дата</label>
                <input class="input" type="date" id="pbCustomDate" min="${new Date().toISOString().slice(0, 10)}">
              </div>

              <div class="field">
                <label>Тип на изпита</label>
                <div class="exam-type-row" style="grid-template-columns:1fr 1fr;gap:8px;">
                  <div class="exam-type-card ${cfg.examType === 'written' ? 'selected' : ''}" data-pbtype="written" style="padding:12px;">
                    <div style="font-size:13px;font-weight:500;">Писмен</div>
                  </div>
                  <div class="exam-type-card ${cfg.examType === 'oral' ? 'selected' : ''}" data-pbtype="oral" style="padding:12px;">
                    <div style="font-size:13px;font-weight:500;">Устен</div>
                  </div>
                </div>
              </div>

              <div class="field">
                <label>Обхват на темите</label>
                <div class="topic-range">
                  <input class="input" type="number" id="pbFrom" min="1" max="${subj.chapters.length}" value="1" placeholder="От">
                  <input class="input" type="number" id="pbTo" min="1" max="${subj.chapters.length}" value="${subj.chapters.length}" placeholder="До">
                </div>
              </div>

              <div class="field">
                <label>или избери конкретни теми</label>
                <div class="topic-list" id="topicList">
                  ${subj.chapters.map((ch, i) => `
                    <label class="topic-item">
                      <input type="checkbox" class="topic-cb" data-idx="${i}">
                      <span class="topic-num-mini">${i + 1}</span>
                      <span>${escapeHtml(ch)}</span>
                    </label>
                  `).join('')}
                </div>
              </div>

              <button class="btn btn-gold btn-block btn-lg" id="generatePlan">Изготви плана →</button>
              ${cfg.examDate ? '' : `
                <p style="font-size:11px;color:var(--text-3);text-align:center;margin-top:10px;">
                  Подсказка: <a href="#/exam-setup/${activeSubjId}" style="color:var(--gold-3);">задай дата на изпита</a>, за да я виждаш в падащото меню.
                </p>
              `}
            </aside>

            <div class="pb-result" id="pbResult">
              ${existingPlan ? renderPlanView(existingPlan, subj, activeSubjId) : `
                <div class="pb-result-empty">
                  <div class="serif" style="font-size:22px;color:var(--navy);margin-bottom:8px;">План още не е изготвен</div>
                  <p style="font-size:14px;color:var(--text-2);max-width:380px;margin:0 auto;">Попълни параметрите вляво и натисни "Изготви плана". Ще видиш разпределение ден по ден.</p>
                </div>
              `}
            </div>
          </div>
        </div>
      </section>
    `;

    // Wire up subject chips
    $$('.chip[data-subj]').forEach(chip => {
      chip.addEventListener('click', () => {
        activeSubjId = chip.dataset.subj;
        render();
      });
    });

    // Wire up exam type cards
    $$('.exam-type-card[data-pbtype]').forEach(card => {
      card.addEventListener('click', () => {
        $$('.exam-type-card[data-pbtype]').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      });
    });

    // Deadline select
    const deadlineSel = $('#pbDeadline');
    deadlineSel.addEventListener('change', () => {
      $('#customDateField').style.display = deadlineSel.value === 'custom' ? 'block' : 'none';
    });

    // Topic checkboxes — when used, override range
    $$('.topic-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        const checked = $$('.topic-cb:checked').map(c => parseInt(c.dataset.idx)).sort((a,b)=>a-b);
        if (checked.length > 0) {
          $('#pbFrom').value = checked[0] + 1;
          $('#pbTo').value = checked[checked.length - 1] + 1;
        }
      });
    });

    // Generate button
    $('#generatePlan').addEventListener('click', () => {
      let deadline = '';
      const dval = deadlineSel.value;
      if (dval === 'exam') deadline = cfg.examDate;
      else if (dval && dval.startsWith('coll_')) deadline = cfg.colloquia[parseInt(dval.slice(5))].date;
      else if (dval === 'custom') deadline = $('#pbCustomDate').value;

      if (!deadline) { toast('Избери валидна дата'); return; }

      const examType = $$('.exam-type-card[data-pbtype].selected')[0]?.dataset.pbtype || 'written';
      const from = parseInt($('#pbFrom').value) || 1;
      const to = parseInt($('#pbTo').value) || subj.chapters.length;

      if (to < from) { toast('Грешен обхват — "до" трябва да е по-голямо от "от"'); return; }
      if (daysUntil(deadline) <= 0) { toast('Датата трябва да е в бъдещето'); return; }

      const plan = generatePlan(activeSubjId, { topicsFrom: from, topicsTo: to, deadline, examType });
      toast('Планът е изготвен — ' + plan.days.length + ' дни', true);
      render();
    });
  }

  render();
}

function renderPlanView(plan, subj, subjId) {
  const today = new Date().toISOString().slice(0, 10);
  const examType = plan.examType;

  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:18px;">
      <div>
        <h3 style="font-size:18px;">План за подготовка</h3>
        <p style="font-size:13px;color:var(--text-2);margin:4px 0 0;">
          Теми ${plan.topicsFrom}–${plan.topicsTo} · до ${formatDate(plan.deadline)} · ${examType === 'oral' ? 'устен' : 'писмен'} изпит · ${plan.days.length} ${plan.days.length === 1 ? 'ден' : 'дни'}
        </p>
      </div>
      <div style="display:flex;gap:6px;">
        <a href="#/exam-setup/${subjId}" class="btn btn-outline btn-sm">Настройки</a>
        <button class="btn btn-outline btn-sm" onclick="if(confirm('Изтрий плана?')){delete state.plans['${subjId}'];saveState();router();}">Изчисти</button>
      </div>
    </div>

    <div class="method-grid">
      ${examType === 'oral' ? `
        <div class="method-card">
          <h5>Метод за устен изпит · 1</h5>
          <p>Изговаряй ключовите тези на глас, като че обясняваш на колега. Чувството за запомняне е по-силно при изговаряне.</p>
        </div>
        <div class="method-card">
          <h5>Метод за устен изпит · 2</h5>
          <p>Структурирай отговора в 3-5 точки. На устен изпит се оценява яснотата, не пълнотата на детайлите.</p>
        </div>
        <div class="method-card">
          <h5>Метод за устен изпит · 3</h5>
          <p>Тренирай преход между темите — често комисията задава "защо" и "какво следва от това". Подготви свързваща нишка.</p>
        </div>
        <div class="method-card">
          <h5>Метод за устен изпит · 4</h5>
          <p>Запиши се на телефона, докато отговаряш. Ще чуеш нерешителности, паузи и думи-паразити, които можеш да премахнеш.</p>
        </div>
      ` : `
        <div class="method-card">
          <h5>Метод за писмен изпит · 1</h5>
          <p>Тренирай с хронометър. На реалния изпит времето е ограничено — учи се да структурираш отговора за минути, не часове.</p>
        </div>
        <div class="method-card">
          <h5>Метод за писмен изпит · 2</h5>
          <p>Започвай всеки отговор със структура: дефиниция → елементи → правна уредба → пример/практика → извод.</p>
        </div>
        <div class="method-card">
          <h5>Метод за писмен изпит · 3</h5>
          <p>Решавай казуси с хронометър. Подражавай на изпитните условия — без книги, ограничено време, на ръка/компютър както ще е реално.</p>
        </div>
        <div class="method-card">
          <h5>Метод за писмен изпит · 4</h5>
          <p>Препрочети написаното — на писмен изпит най-многите грешки идват от прибързване. Заделяй последните 5 мин за корекции.</p>
        </div>
      `}
    </div>

    <h4 style="font-size:14px;font-family:'Inter',sans-serif;font-weight:500;color:var(--text-3);letter-spacing:0.06em;text-transform:uppercase;margin:8px 0 12px;">Ден по ден</h4>
    <div class="plan-day-list">
      ${plan.days.map((d, i) => {
        const dateObj = new Date(d.date);
        const dows = ['Нед','Пон','Вто','Сря','Чет','Пет','Съб'];
        return `
          <div class="plan-day-row ${d.date === today ? 'today-row' : ''}">
            <div class="pd-date">
              ${dows[dateObj.getDay()]} ${d.date === today ? '· днес' : ''}
              <span class="pd-day">${dateObj.getDate()} ${['яну.','фев.','март','апр.','май','юни','юли','авг.','сеп.','окт.','ное.','дек.'][dateObj.getMonth()]}</span>
              <span style="font-size:10px;color:var(--text-3);">Ден ${i + 1}/${plan.days.length}</span>
            </div>
            <div class="pd-tasks">
              ${d.tasks.map(t => `<div class="pd-task-line">${escapeHtml(t.text)}</div>`).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

export { renderPlan, renderPlanView };
